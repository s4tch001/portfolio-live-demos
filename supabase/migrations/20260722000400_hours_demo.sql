begin;

create schema if not exists hours_demo;
revoke all on schema hours_demo from public, anon, authenticated;

create or replace function hours_demo.valid_hours_list(p_hours numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_hours) between 1 and 48
    and not exists (
      select 1 from unnest(p_hours) as value
      where value <= 0 or value > 24
    )
    and (select coalesce(sum(value), 0) from unnest(p_hours) as value) <= 24;
$$;

create table hours_demo.app_settings (
  key text primary key,
  value text not null,
  protected boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table hours_demo.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create table hours_demo.entries (
  session_hash text not null references hours_demo.sessions(token_hash) on update restrict on delete cascade,
  date_key date not null,
  hours_list numeric(4, 2)[] not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (session_hash, date_key),
  constraint hours_list_values_check check (hours_demo.valid_hours_list(hours_list))
);

create index entries_updated_at_idx on hours_demo.entries(updated_at desc);

create table hours_demo.login_rate_limits (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  failed_count integer not null default 0 check (failed_count between 0 and 20),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table hours_demo.mutation_rate_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  logical_date date not null,
  request_count integer not null default 0 check (request_count between 0 and 500),
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function hours_demo.protect_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.protected and current_setting('hours_demo.reset_context', true) <> 'on' then
    raise exception using errcode = '42501', message = 'protected demo setting';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_default_password
before update or delete on hours_demo.app_settings
for each row execute function hours_demo.protect_setting();

create or replace function hours_demo.verify_password(p_password text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from hours_demo.app_settings
    where key = 'password_hash'
      and length(p_password) between 1 and 72
      and value = extensions.crypt(p_password, value)
  );
$$;

create or replace function hours_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  delete from hours_demo.mutation_rate_limits;
  delete from hours_demo.login_rate_limits;
  delete from hours_demo.sessions;

  perform set_config('hours_demo.reset_context', 'on', true);
  insert into hours_demo.app_settings (key, value, protected)
  values ('password_hash', extensions.crypt('password', extensions.gen_salt('bf', 10)), true)
  on conflict (key) do update set
    value = excluded.value,
    protected = true,
    updated_at = clock_timestamp();
end;
$$;

select hours_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

alter table hours_demo.app_settings enable row level security;
alter table hours_demo.sessions enable row level security;
alter table hours_demo.entries enable row level security;
alter table hours_demo.login_rate_limits enable row level security;
alter table hours_demo.mutation_rate_limits enable row level security;

revoke all on all tables in schema hours_demo from public, anon, authenticated;
revoke all on all functions in schema hours_demo from public, anon, authenticated;
grant execute on function hours_demo.valid_hours_list(numeric[]) to service_role;
revoke all on function hours_demo.reset_demo_data(date) from service_role;
grant usage on schema hours_demo to service_role;
grant select, insert, update, delete on all tables in schema hours_demo to service_role;
grant execute on function hours_demo.verify_password(text) to service_role;

update demo_control.applications
set database_reset_ready = true, updated_at = clock_timestamp()
where app_id = 'hours';

commit;
