begin;

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
            'active', job.active,
            'latestRunStatus', latest_run.status,
            'latestRunStartedAt', latest_run.start_time,
            'latestRunEndedAt', latest_run.end_time
          )
          order by job.jobid
        ),
        '[]'::jsonb
      )
      from cron.job as job
      left join lateral (
        select run.status, run.start_time, run.end_time
        from cron.job_run_details as run
        where run.jobid = job.jobid
        order by run.runid desc
        limit 1
      ) as latest_run on true
      where job.jobname = 'portfolio-demo-reset-dispatch'
    )
  );
$$;

revoke all on function public.get_demo_reset_status()
  from public, anon, authenticated;
grant execute on function public.get_demo_reset_status() to service_role;

comment on function public.get_demo_reset_status() is
  'Private service-role status with bounded reset and Cron state; commands, response details, and Vault values are omitted.';

commit;
