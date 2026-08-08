begin;

-- Schedules remain available for the complete Manila month, but a class only
-- receives its generated report and charged usage after that date has ended.
create or replace function cn_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  perform cn_demo.reset_demo_data_month_source(p_logical_date);

  delete from cn_demo.reports as report
  where report.is_baseline
    and report.date >= p_logical_date;

  delete from cn_demo.class_usage as usage
  where usage.is_baseline
    and usage.date >= p_logical_date;

  update cn_demo.class_transactions as tx
  set
    remaining_classes = greatest(
      0,
      tx.total_classes - coalesce((
        select count(*)::integer
        from cn_demo.class_usage as usage
        where usage.transaction_id = tx.id
          and usage.charged
      ), 0)
    ),
    updated_at = clock_timestamp()
  where tx.type = 'purchase';
end;
$$;

revoke all on function cn_demo.reset_demo_data(date)
from public, anon, authenticated, service_role;

-- RCMI keeps its realistic Wednesday/Sunday pattern, but future and current-
-- day service attendance are withheld until the Manila day is complete.
create or replace function rcmi_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  month_start := date_trunc('month', p_logical_date)::date;
  perform rcmi_demo.reset_demo_data_month_source(p_logical_date);

  delete from rcmi_demo.attendance as attendance
  where attendance.is_baseline
    and attendance.attendance_date >= p_logical_date;

  with ordered_members as (
    select
      member.id,
      row_number() over (order by member.id) as member_position
    from rcmi_demo.members as member
    where member.is_baseline
  )
  update rcmi_demo.members as member
  set
    created_at = month_start + ((ordered_members.member_position - 1) % 8)::integer,
    updated_at = clock_timestamp()
  from ordered_members
  where member.id = ordered_members.id;

  update rcmi_demo.member_role_history as history
  set effective_date = member.created_at
  from rcmi_demo.members as member
  where history.member_id = member.id
    and history.is_baseline;
end;
$$;

revoke all on function rcmi_demo.reset_demo_data(date)
from public, anon, authenticated, service_role;

select cn_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);
select rcmi_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

commit;
