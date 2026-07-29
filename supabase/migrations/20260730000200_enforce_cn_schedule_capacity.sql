create or replace function cn_demo.enforce_schedule_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  numeric_balance integer;
  reserved_classes integer;
begin
  if
    current_setting('cn_demo.reset_context', true) = 'on'
    or new.trial
    or new.cancelled
  then
    return new;
  end if;

  if new.student_id is null then
    raise exception using
      errcode = '23514',
      message = 'schedule_student_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(new.student_id);

  if exists (
    select 1
    from cn_demo.class_transactions
    where student_id = new.student_id
      and type = 'monthly-fee'
      and status = 'active'
  ) then
    return new;
  end if;

  select coalesce(sum(remaining_classes), 0)::integer
  into numeric_balance
  from cn_demo.class_transactions
  where student_id = new.student_id
    and type <> 'monthly-fee';

  select count(*)::integer
  into reserved_classes
  from cn_demo.schedules schedule
  where schedule.student_id = new.student_id
    and schedule.id is distinct from new.id
    and not schedule.trial
    and not schedule.cancelled
    and not exists (
      select 1
      from cn_demo.reports report
      where report.schedule_id = schedule.id
    );

  if numeric_balance - reserved_classes <= 0 then
    raise exception using
      errcode = '23514',
      message = 'student_no_remaining_classes';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_schedule_capacity on cn_demo.schedules;

create trigger enforce_schedule_capacity
before insert or update of student_id, student_ids, trial, cancelled
on cn_demo.schedules
for each row execute function cn_demo.enforce_schedule_capacity();

revoke all on function cn_demo.enforce_schedule_capacity()
from public, anon, authenticated, service_role;
