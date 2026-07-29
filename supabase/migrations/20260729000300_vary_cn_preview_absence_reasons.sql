create or replace function cn_demo.normalize_baseline_absence_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reason_variant integer;
begin
  if
    new.is_baseline
    and new.absent
    and current_setting('cn_demo.reset_context', true) = 'on'
  then
    reason_variant := mod(coalesce(new.schedule_id, new.id, 0), 3);

    if reason_variant = 0 then
      new.absent_reason := 'Late Notice';
      new.absent_other := '';
      new.content := replace(
        new.content,
        'the student was absent after a guardian notice.',
        'the student was absent after a late notice.'
      );
    elsif reason_variant = 1 then
      new.absent_reason := 'No Notice';
      new.absent_other := '';
      new.content := replace(
        new.content,
        'the student was absent after a guardian notice.',
        'the student was absent without prior notice.'
      );
    else
      new.absent_reason := 'Other';
      new.absent_other := 'Family schedule conflict';
      new.content := replace(
        new.content,
        'the student was absent after a guardian notice.',
        'the student was absent due to a family schedule conflict.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_baseline_absence_reason on cn_demo.reports;

create trigger normalize_baseline_absence_reason
before insert or update on cn_demo.reports
for each row execute function cn_demo.normalize_baseline_absence_reason();

select set_config('cn_demo.reset_context', 'on', true);

update cn_demo.reports
set absent_reason = absent_reason
where is_baseline and absent;

revoke all on function cn_demo.normalize_baseline_absence_reason()
from public, anon, authenticated;
