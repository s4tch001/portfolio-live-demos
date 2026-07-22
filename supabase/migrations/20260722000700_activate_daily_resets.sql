begin;

-- Supabase Cron and pg_net are the platform-supported pair for invoking an
-- Edge Function on a recurring schedule. pg_cron owns its own schema; pg_net
-- is installed in the shared extensions schema and exposes the net schema.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function demo_control.dispatch_reset_coordinator()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  automation_key text;
  project_url_count integer;
  automation_key_count integer;
  request_id bigint;
begin
  select count(*), max(secret.decrypted_secret)
  into project_url_count, project_url
  from vault.decrypted_secrets as secret
  where secret.name = 'portfolio_demo_project_url';

  select count(*), max(secret.decrypted_secret)
  into automation_key_count, automation_key
  from vault.decrypted_secrets as secret
  where secret.name = 'portfolio_demo_automations_key';

  if project_url_count <> 1
    or project_url is distinct from 'https://ivqfxdibluhgyttgxbmz.supabase.co'
  then
    raise exception using
      errcode = '55000',
      message = 'portfolio demo project URL Vault entry is missing or invalid';
  end if;

  if automation_key_count <> 1
    or automation_key is null
    or automation_key !~ '^sb_secret_[A-Za-z0-9_-]{20,}$'
  then
    raise exception using
      errcode = '55000',
      message = 'portfolio demo automation key Vault entry is missing or invalid';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/reset-coordinator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', automation_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function demo_control.dispatch_reset_coordinator()
  from public, anon, authenticated, service_role;

comment on function demo_control.dispatch_reset_coordinator() is
  'Vault-backed private dispatcher for the idempotent reset coordinator.';

create or replace function public.get_demo_reset_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'timezone', 'Asia/Manila',
    'logicalDate', (clock_timestamp() at time zone 'Asia/Manila')::date,
    'applications', (
      select jsonb_agg(
        jsonb_build_object(
          'appId', application.app_id,
          'databaseResetReady', application.database_reset_ready,
          'enabled', application.enabled,
          'latestLogicalDate', latest_run.logical_date,
          'latestState', latest_run.state,
          'latestSucceededAt', latest_run.succeeded_at
        )
        order by application.app_id
      )
      from demo_control.applications as application
      left join lateral (
        select reset_run.logical_date, reset_run.state, reset_run.succeeded_at
        from demo_control.reset_runs as reset_run
        where reset_run.app_id = application.app_id
        order by reset_run.logical_date desc
        limit 1
      ) as latest_run on true
    ),
    'scheduler', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'jobName', job.jobname,
            'schedule', job.schedule,
            'active', job.active
          )
          order by job.jobid
        ),
        '[]'::jsonb
      )
      from cron.job as job
      where job.jobname = 'portfolio-demo-reset-dispatch'
    )
  );
$$;

revoke all on function public.get_demo_reset_status()
  from public, anon, authenticated;
grant execute on function public.get_demo_reset_status() to service_role;

comment on function public.get_demo_reset_status() is
  'Private service-role status without scheduler commands, Vault values, or error details.';

do $$
declare
  app_count integer;
  ready_count integer;
  project_url_count integer;
  automation_key_count integer;
  project_url text;
  automation_key text;
begin
  select count(*), count(*) filter (where application.database_reset_ready)
  into app_count, ready_count
  from demo_control.applications as application;

  if app_count <> 5 or ready_count <> 5 then
    raise exception using
      errcode = '55000',
      message = 'all five reset handlers must be reviewed before activation';
  end if;

  select count(*), max(secret.decrypted_secret)
  into project_url_count, project_url
  from vault.decrypted_secrets as secret
  where secret.name = 'portfolio_demo_project_url';

  select count(*), max(secret.decrypted_secret)
  into automation_key_count, automation_key
  from vault.decrypted_secrets as secret
  where secret.name = 'portfolio_demo_automations_key';

  if project_url_count <> 1
    or project_url is distinct from 'https://ivqfxdibluhgyttgxbmz.supabase.co'
    or automation_key_count <> 1
    or automation_key is null
    or automation_key !~ '^sb_secret_[A-Za-z0-9_-]{20,}$'
  then
    raise exception using
      errcode = '55000',
      message = 'required reset scheduler Vault entries are missing or invalid';
  end if;
end;
$$;

select cron.schedule(
  'portfolio-demo-reset-dispatch',
  '*/15 * * * *',
  'select demo_control.dispatch_reset_coordinator();'
);

do $$
declare
  matching_jobs integer;
begin
  select count(*)
  into matching_jobs
  from cron.job as job
  where job.jobname = 'portfolio-demo-reset-dispatch'
    and job.schedule = '*/15 * * * *'
    and job.command = 'select demo_control.dispatch_reset_coordinator();'
    and job.active;

  if matching_jobs <> 1 then
    raise exception using
      errcode = '55000',
      message = 'reset scheduler was not installed exactly once';
  end if;
end;
$$;

update demo_control.applications as application
set
  enabled = true,
  updated_at = clock_timestamp()
where application.database_reset_ready
  and not application.enabled;

do $$
begin
  if (
    select count(*)
    from demo_control.applications as application
    where application.enabled and application.database_reset_ready
  ) <> 5 then
    raise exception using
      errcode = '55000',
      message = 'all five reset registrations must be enabled together';
  end if;
end;
$$;

commit;
