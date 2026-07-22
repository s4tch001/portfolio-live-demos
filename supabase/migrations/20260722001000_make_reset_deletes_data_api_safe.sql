begin;

-- The hosted Data API enables a safe-update guard for its execution role. It
-- rejects DELETE statements without an explicit WHERE clause, including those
-- inside a private SECURITY DEFINER function. Keep the full-table reset intent
-- explicit with WHERE true, and restrict this forward-only rewrite to the
-- reviewed functions and exact statements below.
do $$
declare
  target record;
  function_definition text;
  delete_statement text;
begin
  for target in
    select *
    from (
      values
        (
          'cn_demo.reset_demo_data(date)',
          array[
            'delete from cn_demo.sessions;',
            'delete from cn_demo.uploads;',
            'delete from cn_demo.login_rate_limits;',
            'delete from cn_demo.notifications;',
            'delete from cn_demo.report_drafts;',
            'delete from cn_demo.class_usage;',
            'delete from cn_demo.activity_logs;'
          ]::text[]
        ),
        (
          'rcmi_demo.reset_demo_data(date)',
          array[
            'delete from rcmi_demo.admin_sessions;',
            'delete from rcmi_demo.login_rate_limits;',
            'delete from rcmi_demo.mutation_rate_limits;',
            'delete from rcmi_demo.attendance;',
            'delete from rcmi_demo.member_role_history;',
            'delete from rcmi_demo.members;'
          ]::text[]
        ),
        (
          'hours_demo.reset_demo_data(date)',
          array[
            'delete from hours_demo.mutation_rate_limits;',
            'delete from hours_demo.login_rate_limits;',
            'delete from hours_demo.sessions;'
          ]::text[]
        )
    ) as reviewed(signature, delete_statements)
  loop
    select pg_get_functiondef(to_regprocedure(target.signature))
    into strict function_definition;

    foreach delete_statement in array target.delete_statements
    loop
      if strpos(function_definition, delete_statement) = 0 then
        raise exception using
          errcode = '55000',
          message = 'reviewed reset function no longer matches its safe-delete migration';
      end if;

      function_definition := replace(
        function_definition,
        delete_statement,
        replace(delete_statement, ';', ' where true;')
      );
    end loop;

    execute function_definition;
  end loop;
end;
$$;

-- The remaining CN deletes already have an explicit baseline predicate. This
-- assertion prevents a future unreviewed unconditional DELETE from slipping
-- into any persistent reset handler.
do $$
declare
  signature text;
  function_definition text;
begin
  foreach signature in array array[
    'cn_demo.reset_demo_data(date)',
    'rcmi_demo.reset_demo_data(date)',
    'hours_demo.reset_demo_data(date)'
  ]
  loop
    select pg_get_functiondef(to_regprocedure(signature))
    into strict function_definition;

    if function_definition ~* 'delete\s+from\s+[a-z_]+\.[a-z_]+\s*;' then
      raise exception using
        errcode = '55000',
        message = 'reset handler still contains an unconditional DELETE without WHERE';
    end if;
  end loop;
end;
$$;

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
