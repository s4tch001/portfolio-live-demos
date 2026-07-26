-- Keep CN preview schedule data on the real default 25-minute slots.
-- The previous preview seed used hand-written 45-minute slots; this normalizer
-- protects both the current rows and any future daily reset rows.

create or replace function cn_demo.normalize_preview_schedule_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.timeslot := case new.timeslot
    when '09:00 - 09:45' then '10:00 - 10:25'
    when '10:00 - 10:45' then '10:30 - 10:55'
    when '11:00 - 11:45' then '11:00 - 11:25'
    when '13:00 - 13:45' then '11:30 - 11:55'
    when '14:00 - 14:45' then '12:00 - 12:25'
    when '15:00 - 15:45' then '12:30 - 12:55'
    when '16:00 - 16:45' then '13:00 - 13:25'
    when '17:00 - 17:45' then '13:30 - 13:55'
    else new.timeslot
  end;

  if coalesce(new.note, '') like '%six booked hours on weekdays%' then
    new.note := 'Generated current-month preview schedule using the default 25-minute class slots. Teachers rest on weekends.';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_preview_schedule_slot_before_write on cn_demo.schedules;
create trigger normalize_preview_schedule_slot_before_write
before insert or update of timeslot, note on cn_demo.schedules
for each row
execute function cn_demo.normalize_preview_schedule_slot();

create or replace function cn_demo.normalize_preview_class_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.class_duration = '45 minutes' then
    new.class_duration := '25 mins';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_preview_report_duration_before_write on cn_demo.reports;
create trigger normalize_preview_report_duration_before_write
before insert or update of class_duration on cn_demo.reports
for each row
execute function cn_demo.normalize_preview_class_duration();

create or replace function cn_demo.normalize_preview_usage_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.duration = '45 minutes' then
    new.duration := '25 mins';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_preview_usage_duration_before_write on cn_demo.class_usage;
create trigger normalize_preview_usage_duration_before_write
before insert or update of duration on cn_demo.class_usage
for each row
execute function cn_demo.normalize_preview_usage_duration();

update cn_demo.schedules
set
  timeslot = case timeslot
    when '09:00 - 09:45' then '10:00 - 10:25'
    when '10:00 - 10:45' then '10:30 - 10:55'
    when '11:00 - 11:45' then '11:00 - 11:25'
    when '13:00 - 13:45' then '11:30 - 11:55'
    when '14:00 - 14:45' then '12:00 - 12:25'
    when '15:00 - 15:45' then '12:30 - 12:55'
    when '16:00 - 16:45' then '13:00 - 13:25'
    when '17:00 - 17:45' then '13:30 - 13:55'
    else timeslot
  end,
  note = case
    when coalesce(note, '') like '%six booked hours on weekdays%'
      then 'Generated current-month preview schedule using the default 25-minute class slots. Teachers rest on weekends.'
    else note
  end
where timeslot in (
  '09:00 - 09:45',
  '10:00 - 10:45',
  '11:00 - 11:45',
  '13:00 - 13:45',
  '14:00 - 14:45',
  '15:00 - 15:45',
  '16:00 - 16:45',
  '17:00 - 17:45'
)
or coalesce(note, '') like '%six booked hours on weekdays%';

update cn_demo.reports
set class_duration = '25 mins'
where class_duration = '45 minutes';

update cn_demo.class_usage
set duration = '25 mins'
where duration = '45 minutes';
