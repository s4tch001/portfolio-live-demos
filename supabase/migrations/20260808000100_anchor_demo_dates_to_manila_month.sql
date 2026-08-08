begin;

-- Preserve the reviewed, deployed generators as private implementation details.
-- The public reset contract keeps the same signature, while the wrappers below
-- provide a stable month anchor even though disposable visitor data is purged
-- every Manila day.
alter function cn_demo.reset_demo_data(date)
  rename to reset_demo_data_month_source;

create or replace function cn_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
  stable_report_cutoff date;
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  month_start := date_trunc('month', p_logical_date)::date;
  stable_report_cutoff := month_start + 13;

  -- The source generator derives every visible date from its argument's month.
  -- Passing a fixed day of that month prevents the report/usage set from
  -- changing on daily resets, while schedules still cover the complete month.
  perform cn_demo.reset_demo_data_month_source(stable_report_cutoff);
end;
$$;

revoke all on function cn_demo.reset_demo_data_month_source(date)
from public, anon, authenticated, service_role;

revoke all on function cn_demo.reset_demo_data(date)
from public, anon, authenticated, service_role;

alter function rcmi_demo.reset_demo_data(date)
  rename to reset_demo_data_month_source;

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
  perform rcmi_demo.reset_demo_data_month_source(month_start);

  -- Join dates and their corresponding role-history dates are visible in the
  -- administrator demo. Keep them in the same Manila month as attendance.
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

revoke all on function rcmi_demo.reset_demo_data_month_source(date)
from public, anon, authenticated, service_role;

revoke all on function rcmi_demo.reset_demo_data(date)
from public, anon, authenticated, service_role;

select cn_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);
select rcmi_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

commit;
