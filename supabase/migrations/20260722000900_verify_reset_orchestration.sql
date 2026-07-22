begin;

-- Exercise the exact public service-role wrapper used by the Edge coordinator.
-- The migration is transactional: any wrapper or handler failure rolls back
-- every lease and data change and reports which allowlisted app failed.
do $$
declare
  current_run record;
  test_worker_id uuid;
  resulting_state demo_control.reset_state;
begin
  for current_run in
    select reset_run.id, reset_run.app_id
    from demo_control.reset_runs as reset_run
    where reset_run.logical_date = (clock_timestamp() at time zone 'Asia/Manila')::date
      and reset_run.state = 'failed'
    order by reset_run.app_id
    for update
  loop
    test_worker_id := gen_random_uuid();

    update demo_control.reset_runs as reset_run
    set
      state = 'running',
      worker_id = test_worker_id,
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      database_cleared_at = null,
      storage_cleared_at = null,
      succeeded_at = null,
      last_error_category = null,
      updated_at = clock_timestamp()
    where reset_run.id = current_run.id;

    begin
      perform *
      from public.execute_demo_database_reset(current_run.id, test_worker_id);
    exception when others then
      raise exception using
        errcode = sqlstate,
        message = current_run.app_id || ' reset orchestration self-test failed: ' || sqlerrm;
    end;

    select reset_run.state
    into resulting_state
    from demo_control.reset_runs as reset_run
    where reset_run.id = current_run.id;

    if resulting_state = 'db_cleared' then
      perform public.mark_demo_storage_pending(current_run.id, test_worker_id);
    elsif resulting_state <> 'succeeded' then
      raise exception using
        errcode = '55000',
        message = current_run.app_id || ' reset orchestration returned an invalid state';
    end if;
  end loop;
end;
$$;

commit;
