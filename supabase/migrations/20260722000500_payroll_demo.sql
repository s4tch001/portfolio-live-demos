begin;

create schema if not exists payroll_demo;
revoke all on schema payroll_demo from public, anon, authenticated, service_role;

create or replace function payroll_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  -- This calculator intentionally persists no visitor data. The reset handler
  -- remains registered so the coordinator has one explicit handler per demo.
  return;
end;
$$;

revoke all on all functions in schema payroll_demo from public, anon, authenticated, service_role;

update demo_control.applications
set database_reset_ready = true, updated_at = clock_timestamp()
where app_id = 'payroll';

commit;
