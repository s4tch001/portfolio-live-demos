begin;

create schema if not exists rcmi_demo;
revoke all on schema rcmi_demo from public, anon, authenticated;

create table rcmi_demo.members (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  role text not null check (role in ('member', 'leader', 'guest')),
  leader_id uuid references rcmi_demo.members(id) on update restrict on delete restrict,
  district_leader_id text check (district_leader_id in ('pastor-sherwin', 'ate-anj')),
  active boolean not null default true,
  is_baseline boolean not null default false,
  created_at date not null default (clock_timestamp() at time zone 'Asia/Manila')::date,
  updated_at timestamptz not null default clock_timestamp(),
  constraint members_role_relationship_check check (
    (role = 'leader' and leader_id is null and district_leader_id is not null)
    or (role <> 'leader' and district_leader_id is null)
  )
);

create unique index members_active_name_unique
on rcmi_demo.members (lower(name)) where active;

create table rcmi_demo.member_role_history (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references rcmi_demo.members(id) on update restrict on delete cascade,
  role text not null check (role in ('member', 'leader', 'guest')),
  leader_id uuid references rcmi_demo.members(id) on update restrict on delete set null,
  effective_date date not null,
  is_baseline boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create index member_role_history_lookup_idx
on rcmi_demo.member_role_history (member_id, effective_date desc, created_at desc);

create table rcmi_demo.attendance (
  attendance_date date not null,
  member_id uuid not null references rcmi_demo.members(id) on update restrict on delete restrict,
  is_baseline boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (attendance_date, member_id)
);

create index attendance_created_at_idx
on rcmi_demo.attendance (created_at desc, member_id desc);

create table rcmi_demo.app_settings (
  key text primary key,
  value text not null,
  protected boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table rcmi_demo.admin_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create table rcmi_demo.login_rate_limits (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  failed_count integer not null default 0 check (failed_count between 0 and 20),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table rcmi_demo.mutation_rate_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  logical_date date not null,
  request_count integer not null default 0 check (request_count between 0 and 500),
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function rcmi_demo.protect_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.protected and current_setting('rcmi_demo.reset_context', true) <> 'on' then
    raise exception using errcode = '42501', message = 'protected demo setting';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_default_password
before update or delete on rcmi_demo.app_settings
for each row execute function rcmi_demo.protect_setting();

create or replace function rcmi_demo.verify_admin_password(p_password text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from rcmi_demo.app_settings
    where key = 'admin_password_hash'
      and length(p_password) between 1 and 72
      and value = extensions.crypt(p_password, value)
  );
$$;

create or replace function rcmi_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  leader_a constant uuid := '10000000-0000-4000-8000-000000000001';
  leader_b constant uuid := '10000000-0000-4000-8000-000000000002';
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  perform set_config('rcmi_demo.reset_context', 'on', true);
  delete from rcmi_demo.admin_sessions;
  delete from rcmi_demo.login_rate_limits;
  delete from rcmi_demo.mutation_rate_limits;
  delete from rcmi_demo.attendance;
  delete from rcmi_demo.member_role_history;
  delete from rcmi_demo.members;

  insert into rcmi_demo.members (id, name, role, leader_id, district_leader_id, active, is_baseline, created_at)
  values
    (leader_a, 'Preview Leader A', 'leader', null, 'pastor-sherwin', true, true, p_logical_date - 60),
    (leader_b, 'Preview Leader B', 'leader', null, 'ate-anj', true, true, p_logical_date - 55),
    ('10000000-0000-4000-8000-000000000003', 'Preview Member A', 'member', leader_a, null, true, true, p_logical_date - 50),
    ('10000000-0000-4000-8000-000000000004', 'Preview Member B', 'member', leader_a, null, true, true, p_logical_date - 45),
    ('10000000-0000-4000-8000-000000000005', 'Preview Member C', 'member', leader_b, null, true, true, p_logical_date - 40),
    ('10000000-0000-4000-8000-000000000006', 'Preview Member D', 'member', leader_b, null, true, true, p_logical_date - 35),
    ('10000000-0000-4000-8000-000000000007', 'Preview Guest A', 'guest', leader_a, null, true, true, p_logical_date - 10),
    ('10000000-0000-4000-8000-000000000008', 'Preview Guest B', 'guest', leader_b, null, true, true, p_logical_date - 8);

  insert into rcmi_demo.member_role_history (id, member_id, role, leader_id, effective_date, is_baseline)
  select
    ('20000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
    id,
    role,
    leader_id,
    created_at,
    true
  from rcmi_demo.members;

  insert into rcmi_demo.attendance (attendance_date, member_id, is_baseline)
  values
    (p_logical_date, leader_a, true),
    (p_logical_date, leader_b, true),
    (p_logical_date, '10000000-0000-4000-8000-000000000003', true),
    (p_logical_date, '10000000-0000-4000-8000-000000000005', true),
    (p_logical_date, '10000000-0000-4000-8000-000000000007', true),
    (p_logical_date - 1, leader_a, true),
    (p_logical_date - 1, '10000000-0000-4000-8000-000000000003', true),
    (p_logical_date - 1, '10000000-0000-4000-8000-000000000004', true),
    (p_logical_date - 2, leader_b, true),
    (p_logical_date - 2, '10000000-0000-4000-8000-000000000006', true);

  insert into rcmi_demo.app_settings (key, value, protected)
  values
    ('district_leader.pastor-sherwin', 'Pastor Sherwin', false),
    ('district_leader.ate-anj', 'Ate Anj', false),
    ('admin_password_hash', extensions.crypt('password', extensions.gen_salt('bf', 10)), true)
  on conflict (key) do update set
    value = excluded.value,
    protected = excluded.protected,
    updated_at = clock_timestamp();
end;
$$;

select rcmi_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

alter table rcmi_demo.members enable row level security;
alter table rcmi_demo.member_role_history enable row level security;
alter table rcmi_demo.attendance enable row level security;
alter table rcmi_demo.app_settings enable row level security;
alter table rcmi_demo.admin_sessions enable row level security;
alter table rcmi_demo.login_rate_limits enable row level security;
alter table rcmi_demo.mutation_rate_limits enable row level security;

revoke all on all tables in schema rcmi_demo from public, anon, authenticated;
revoke all on all functions in schema rcmi_demo from public, anon, authenticated;
revoke all on function rcmi_demo.reset_demo_data(date) from service_role;
grant usage on schema rcmi_demo to service_role;
grant select, insert, update, delete on all tables in schema rcmi_demo to service_role;
grant execute on function rcmi_demo.verify_admin_password(text) to service_role;

update demo_control.applications
set database_reset_ready = true, updated_at = clock_timestamp()
where app_id = 'rcmi';

commit;
