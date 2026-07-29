create or replace function cn_demo.charge_completed_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_row cn_demo.schedules%rowtype;
  student_ids bigint[];
  target_student_id bigint;
  transaction_row cn_demo.class_transactions%rowtype;
  usage_remarks text;
begin
  if current_setting('cn_demo.reset_context', true) = 'on' then
    return new;
  end if;

  select *
  into schedule_row
  from cn_demo.schedules
  where id = new.schedule_id;

  if not found or schedule_row.cancelled or schedule_row.trial then
    return new;
  end if;

  student_ids := case
    when cardinality(schedule_row.student_ids) > 0 then schedule_row.student_ids
    when schedule_row.student_id is not null then array[schedule_row.student_id]
    else '{}'::bigint[]
  end;

  usage_remarks := case
    when new.absent then
      case new.absent_reason
        when 'Other' then 'Absent: Other - ' || coalesce(nullif(new.absent_other, ''), 'Unspecified')
        when '' then 'Absent'
        else 'Absent: ' || new.absent_reason
      end
    else coalesce(nullif(new.tracker_remarks, ''), 'Completed')
  end;

  foreach target_student_id in array student_ids loop
    if exists (
      select 1
      from cn_demo.class_usage usage
      join cn_demo.class_transactions transaction
        on transaction.id = usage.transaction_id
      where usage.schedule_id = schedule_row.id
        and transaction.student_id = target_student_id
        and usage.charged
    ) then
      continue;
    end if;

    select *
    into transaction_row
    from cn_demo.class_transactions
    where cn_demo.class_transactions.student_id = target_student_id
      and remaining_classes > 0
      and type <> 'monthly-fee'
    order by date, id
    limit 1
    for update;

    if not found then
      continue;
    end if;

    update cn_demo.class_transactions
    set remaining_classes = greatest(0, remaining_classes - 1),
        updated_at = clock_timestamp()
    where id = transaction_row.id;

    insert into cn_demo.class_usage (
      transaction_id,
      schedule_id,
      date,
      time,
      duration,
      materials,
      pages,
      remarks,
      charged,
      is_baseline
    )
    values (
      transaction_row.id,
      schedule_row.id,
      new.date,
      split_part(schedule_row.timeslot, ' - ', 1),
      new.class_duration,
      new.book,
      new.pages,
      usage_remarks,
      true,
      false
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists charge_completed_report on cn_demo.reports;

create trigger charge_completed_report
after insert or update on cn_demo.reports
for each row execute function cn_demo.charge_completed_report();

create or replace function cn_demo.refund_schedule_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_schedule_id bigint;
  usage_row record;
begin
  if tg_op = 'UPDATE' then
    if not new.cancelled or old.cancelled then
      return new;
    end if;
    target_schedule_id := new.id;
  else
    target_schedule_id := old.id;
  end if;

  for usage_row in
    select id, transaction_id
    from cn_demo.class_usage
    where schedule_id = target_schedule_id
      and charged
    for update
  loop
    update cn_demo.class_transactions
    set remaining_classes = remaining_classes + 1,
        updated_at = clock_timestamp()
    where id = usage_row.transaction_id;

    delete from cn_demo.class_usage
    where id = usage_row.id;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists refund_cancelled_schedule_usage on cn_demo.schedules;
drop trigger if exists refund_deleted_schedule_usage on cn_demo.schedules;

create trigger refund_cancelled_schedule_usage
after update of cancelled on cn_demo.schedules
for each row execute function cn_demo.refund_schedule_usage();

create trigger refund_deleted_schedule_usage
before delete on cn_demo.schedules
for each row execute function cn_demo.refund_schedule_usage();

revoke all on function cn_demo.charge_completed_report()
from public, anon, authenticated, service_role;

revoke all on function cn_demo.refund_schedule_usage()
from public, anon, authenticated, service_role;

update cn_demo.reports
set submitted_at = submitted_at;
