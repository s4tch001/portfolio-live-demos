begin;

create schema if not exists travels_demo;
revoke all on schema travels_demo from public, anon, authenticated, service_role;

create or replace function travels_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  -- This static showcase intentionally persists no visitor data. The reset
  -- handler remains explicit so every registered demo has a bounded contract.
  return;
end;
$$;

revoke all on all functions in schema travels_demo from public, anon, authenticated, service_role;

update demo_control.applications
set database_reset_ready = true, updated_at = clock_timestamp()
where app_id = 'travels';

commit;
