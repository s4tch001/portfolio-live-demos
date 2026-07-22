begin;

-- Run every persistent reset handler in the same privileged database context
-- used by the coordinator. Any failure aborts this migration and leaves the
-- current demo data untouched, making activation fail closed.
do $$
declare
  logical_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  begin
    perform cn_demo.reset_demo_data(logical_date);
  exception when others then
    raise exception using
      errcode = sqlstate,
      message = 'CN reset handler self-test failed: ' || sqlerrm;
  end;

  begin
    perform rcmi_demo.reset_demo_data(logical_date);
  exception when others then
    raise exception using
      errcode = sqlstate,
      message = 'RCMI reset handler self-test failed: ' || sqlerrm;
  end;

  begin
    perform hours_demo.reset_demo_data(logical_date);
  exception when others then
    raise exception using
      errcode = sqlstate,
      message = 'Hours reset handler self-test failed: ' || sqlerrm;
  end;
end;
$$;

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
          'latestAttemptCount', latest_run.attempt_count,
          'latestErrorCategory', latest_run.last_error_category,
          'latestSucceededAt', latest_run.succeeded_at
        )
        order by application.app_id
      )
      from demo_control.applications as application
      left join lateral (
        select
          reset_run.logical_date,
          reset_run.state,
          reset_run.attempt_count,
          reset_run.last_error_category,
          reset_run.succeeded_at
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
  'Private service-role status with bounded error categories and no scheduler commands or Vault values.';

-- A handler self-test above has already restored persistent baselines. Release
-- only today's failed runs so the coordinator can prove the full public path.
update demo_control.reset_runs as reset_run
set
  state = 'pending',
  worker_id = null,
  lease_expires_at = null,
  database_cleared_at = null,
  storage_cleared_at = null,
  succeeded_at = null,
  last_error_category = null,
  updated_at = clock_timestamp()
where reset_run.logical_date = (clock_timestamp() at time zone 'Asia/Manila')::date
  and reset_run.state = 'failed';

commit;
