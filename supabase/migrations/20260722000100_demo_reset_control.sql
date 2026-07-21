begin;

create schema if not exists demo_control;

revoke all on schema demo_control from public, anon, authenticated, service_role;

create type demo_control.reset_state as enum (
  'pending',
  'running',
  'db_cleared',
  'storage_pending',
  'succeeded',
  'failed'
);

create table demo_control.applications (
  app_id text primary key,
  hostname text not null unique,
  timezone_name text not null default 'Asia/Manila',
  reset_local_time time without time zone not null default time '00:00',
  enabled boolean not null default false,
  database_reset_ready boolean not null default false,
  handler_schema name not null,
  handler_function name not null default 'reset_demo_data',
  storage_bucket text,
  disposable_prefix text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint applications_known_app_check
    check (app_id in ('cn', 'rcmi', 'hours', 'payroll', 'travels')),
  constraint applications_hostname_check
    check (hostname = app_id || '-demo.pauuu.dev'),
  constraint applications_timezone_check
    check (timezone_name = 'Asia/Manila'),
  constraint applications_storage_pair_check
    check ((storage_bucket is null) = (disposable_prefix is null)),
  constraint applications_storage_value_check
    check (
      storage_bucket is null
      or (
        storage_bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
        and disposable_prefix ~ '^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$'
      )
    )
);

insert into demo_control.applications (
  app_id,
  hostname,
  handler_schema,
  storage_bucket,
  disposable_prefix
)
values
  ('cn', 'cn-demo.pauuu.dev', 'cn_demo', 'cn-private', 'visitor'),
  ('rcmi', 'rcmi-demo.pauuu.dev', 'rcmi_demo', null, null),
  ('hours', 'hours-demo.pauuu.dev', 'hours_demo', null, null),
  ('payroll', 'payroll-demo.pauuu.dev', 'payroll_demo', null, null),
  ('travels', 'travels-demo.pauuu.dev', 'travels_demo', null, null);

create table demo_control.reset_runs (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references demo_control.applications (app_id) on update restrict on delete restrict,
  logical_date date not null,
  state demo_control.reset_state not null default 'pending',
  attempt_count integer not null default 0,
  worker_id uuid,
  lease_expires_at timestamptz,
  database_cleared_at timestamptz,
  storage_cleared_at timestamptz,
  succeeded_at timestamptz,
  last_error_category text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint reset_runs_app_day_key unique (app_id, logical_date),
  constraint reset_runs_attempt_count_check check (attempt_count >= 0),
  constraint reset_runs_worker_lease_pair_check
    check ((worker_id is null) = (lease_expires_at is null)),
  constraint reset_runs_error_category_check
    check (
      last_error_category is null
      or last_error_category ~ '^[a-z0-9_]{1,48}$'
    ),
  constraint reset_runs_success_check
    check (
      state <> 'succeeded'
      or (
        database_cleared_at is not null
        and storage_cleared_at is not null
        and succeeded_at is not null
      )
    )
);

create index reset_runs_retry_idx
  on demo_control.reset_runs (logical_date, state, lease_expires_at)
  where state <> 'succeeded';

alter table demo_control.applications enable row level security;
alter table demo_control.applications force row level security;
alter table demo_control.reset_runs enable row level security;
alter table demo_control.reset_runs force row level security;

revoke all on all tables in schema demo_control from public, anon, authenticated, service_role;
revoke all on all sequences in schema demo_control from public, anon, authenticated, service_role;
alter default privileges in schema demo_control
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema demo_control
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema demo_control
  revoke execute on functions from public, anon, authenticated, service_role;

create or replace function demo_control.claim_due_resets(
  p_worker_id uuid,
  p_now timestamptz default clock_timestamp(),
  p_lease interval default interval '2 minutes',
  p_limit integer default 5
)
returns table (
  run_id uuid,
  app_id text,
  logical_date date,
  reset_state text,
  storage_bucket text,
  disposable_prefix text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null
    or p_lease < interval '30 seconds'
    or p_lease > interval '10 minutes'
    or p_limit < 1
    or p_limit > 5
  then
    raise exception using errcode = '22023', message = 'invalid reset claim arguments';
  end if;

  insert into demo_control.reset_runs (app_id, logical_date)
  select
    application.app_id,
    (p_now at time zone application.timezone_name)::date
  from demo_control.applications as application
  where application.enabled
    and application.database_reset_ready
    and (p_now at time zone application.timezone_name)::time >= application.reset_local_time
  on conflict on constraint reset_runs_app_day_key do nothing;

  return query
  with candidates as (
    select reset_run.id
    from demo_control.reset_runs as reset_run
    inner join demo_control.applications as application
      on application.app_id = reset_run.app_id
    where application.enabled
      and application.database_reset_ready
      and reset_run.logical_date = (p_now at time zone application.timezone_name)::date
      and reset_run.state <> 'succeeded'
      and (
        reset_run.worker_id is null
        or reset_run.lease_expires_at <= p_now
        or reset_run.worker_id = p_worker_id
      )
    order by reset_run.app_id
    for update of reset_run skip locked
    limit p_limit
  ), claimed as (
    update demo_control.reset_runs as reset_run
    set
      state = case
        when reset_run.database_cleared_at is null then 'running'::demo_control.reset_state
        else 'storage_pending'::demo_control.reset_state
      end,
      attempt_count = reset_run.attempt_count + 1,
      worker_id = p_worker_id,
      lease_expires_at = p_now + p_lease,
      last_error_category = null,
      updated_at = p_now
    from candidates
    where reset_run.id = candidates.id
    returning
      reset_run.id,
      reset_run.app_id,
      reset_run.logical_date,
      reset_run.state
  )
  select
    claimed.id,
    claimed.app_id,
    claimed.logical_date,
    claimed.state::text,
    application.storage_bucket,
    application.disposable_prefix
  from claimed
  inner join demo_control.applications as application
    on application.app_id = claimed.app_id
  order by claimed.app_id;
end;
$$;

create or replace function demo_control.execute_database_reset(
  p_run_id uuid,
  p_worker_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns table (
  reset_state text,
  storage_bucket text,
  disposable_prefix text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_run demo_control.reset_runs%rowtype;
  application demo_control.applications%rowtype;
begin
  select candidate.*
  into reset_run
  from demo_control.reset_runs as candidate
  where candidate.id = p_run_id
  for update;

  if not found
    or reset_run.worker_id is distinct from p_worker_id
    or reset_run.lease_expires_at <= p_now
  then
    raise exception using errcode = '42501', message = 'reset lease is not valid';
  end if;

  select candidate.*
  into strict application
  from demo_control.applications as candidate
  where candidate.app_id = reset_run.app_id;

  if not application.enabled or not application.database_reset_ready then
    raise exception using errcode = '55000', message = 'reset handler is not ready';
  end if;

  if reset_run.database_cleared_at is null then
    if to_regprocedure(
      format('%I.%I(date)', application.handler_schema, application.handler_function)
    ) is null then
      raise exception using errcode = '55000', message = 'reset handler is unavailable';
    end if;

    execute format(
      'select %I.%I($1)',
      application.handler_schema,
      application.handler_function
    ) using reset_run.logical_date;
  end if;

  update demo_control.reset_runs as updated_run
  set
    state = case
      when application.storage_bucket is null then 'succeeded'::demo_control.reset_state
      else 'db_cleared'::demo_control.reset_state
    end,
    database_cleared_at = coalesce(updated_run.database_cleared_at, p_now),
    storage_cleared_at = case
      when application.storage_bucket is null then p_now
      else updated_run.storage_cleared_at
    end,
    succeeded_at = case
      when application.storage_bucket is null then p_now
      else null
    end,
    worker_id = case when application.storage_bucket is null then null else p_worker_id end,
    lease_expires_at = case when application.storage_bucket is null then null else updated_run.lease_expires_at end,
    last_error_category = null,
    updated_at = p_now
  where updated_run.id = p_run_id;

  return query
  select
    updated_run.state::text,
    application.storage_bucket,
    application.disposable_prefix
  from demo_control.reset_runs as updated_run
  where updated_run.id = p_run_id;
end;
$$;

create or replace function demo_control.mark_storage_pending(
  p_run_id uuid,
  p_worker_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_state text;
begin
  update demo_control.reset_runs as reset_run
  set
    state = 'storage_pending',
    worker_id = null,
    lease_expires_at = null,
    last_error_category = null,
    updated_at = p_now
  from demo_control.applications as application
  where reset_run.id = p_run_id
    and application.app_id = reset_run.app_id
    and application.storage_bucket is not null
    and reset_run.database_cleared_at is not null
    and reset_run.worker_id = p_worker_id
    and reset_run.lease_expires_at > p_now
    and reset_run.state in ('db_cleared', 'storage_pending')
  returning reset_run.state::text into resulting_state;

  if resulting_state is null then
    raise exception using errcode = '42501', message = 'storage transition is not allowed';
  end if;

  return resulting_state;
end;
$$;

create or replace function demo_control.mark_storage_succeeded(
  p_run_id uuid,
  p_worker_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_state text;
begin
  update demo_control.reset_runs as reset_run
  set
    state = 'succeeded',
    storage_cleared_at = p_now,
    succeeded_at = p_now,
    worker_id = null,
    lease_expires_at = null,
    last_error_category = null,
    updated_at = p_now
  from demo_control.applications as application
  where reset_run.id = p_run_id
    and application.app_id = reset_run.app_id
    and application.storage_bucket is not null
    and reset_run.database_cleared_at is not null
    and reset_run.worker_id = p_worker_id
    and reset_run.lease_expires_at > p_now
    and reset_run.state in ('db_cleared', 'storage_pending')
  returning reset_run.state::text into resulting_state;

  if resulting_state is null then
    raise exception using errcode = '42501', message = 'storage transition is not allowed';
  end if;

  return resulting_state;
end;
$$;

create or replace function demo_control.mark_reset_failed(
  p_run_id uuid,
  p_worker_id uuid,
  p_error_category text,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_run demo_control.reset_runs%rowtype;
begin
  if p_error_category is null or p_error_category !~ '^[a-z0-9_]{1,48}$' then
    raise exception using errcode = '22023', message = 'invalid error category';
  end if;

  select candidate.*
  into reset_run
  from demo_control.reset_runs as candidate
  where candidate.id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'reset run was not found';
  end if;

  if reset_run.state = 'succeeded' then
    return reset_run.state::text;
  end if;

  if reset_run.worker_id is distinct from p_worker_id then
    raise exception using errcode = '42501', message = 'reset lease is not owned';
  end if;

  update demo_control.reset_runs as updated_run
  set
    state = 'failed',
    worker_id = null,
    lease_expires_at = null,
    last_error_category = p_error_category,
    updated_at = p_now
  where updated_run.id = p_run_id;

  return 'failed';
end;
$$;

revoke all on all functions in schema demo_control from public, anon, authenticated, service_role;

create or replace function public.claim_due_demo_resets(p_worker_id uuid)
returns table (
  run_id uuid,
  app_id text,
  logical_date date,
  reset_state text,
  storage_bucket text,
  disposable_prefix text
)
language sql
security definer
set search_path = ''
as $$
  select *
  from demo_control.claim_due_resets(p_worker_id);
$$;

create or replace function public.execute_demo_database_reset(
  p_run_id uuid,
  p_worker_id uuid
)
returns table (
  reset_state text,
  storage_bucket text,
  disposable_prefix text
)
language sql
security definer
set search_path = ''
as $$
  select *
  from demo_control.execute_database_reset(p_run_id, p_worker_id);
$$;

create or replace function public.mark_demo_storage_pending(
  p_run_id uuid,
  p_worker_id uuid
)
returns text
language sql
security definer
set search_path = ''
as $$
  select demo_control.mark_storage_pending(p_run_id, p_worker_id);
$$;

create or replace function public.mark_demo_storage_succeeded(
  p_run_id uuid,
  p_worker_id uuid
)
returns text
language sql
security definer
set search_path = ''
as $$
  select demo_control.mark_storage_succeeded(p_run_id, p_worker_id);
$$;

create or replace function public.mark_demo_reset_failed(
  p_run_id uuid,
  p_worker_id uuid,
  p_error_category text
)
returns text
language sql
security definer
set search_path = ''
as $$
  select demo_control.mark_reset_failed(p_run_id, p_worker_id, p_error_category);
$$;

revoke all on function public.claim_due_demo_resets(uuid) from public, anon, authenticated;
revoke all on function public.execute_demo_database_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_demo_storage_pending(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_demo_storage_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_demo_reset_failed(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.claim_due_demo_resets(uuid) to service_role;
grant execute on function public.execute_demo_database_reset(uuid, uuid) to service_role;
grant execute on function public.mark_demo_storage_pending(uuid, uuid) to service_role;
grant execute on function public.mark_demo_storage_succeeded(uuid, uuid) to service_role;
grant execute on function public.mark_demo_reset_failed(uuid, uuid, text) to service_role;

comment on schema demo_control is
  'Private state and orchestration primitives for disposable portfolio demos.';
comment on table demo_control.applications is
  'Allowlisted demo registry. Apps remain disabled until their reset handler is installed and reviewed.';
comment on table demo_control.reset_runs is
  'Idempotent reset state keyed by application and logical Asia/Manila date.';

commit;
