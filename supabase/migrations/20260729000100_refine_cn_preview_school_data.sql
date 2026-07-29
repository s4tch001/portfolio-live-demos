begin;

create or replace function cn_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_logical_date)::date;
  month_end date := (date_trunc('month', p_logical_date)::date + interval '1 month - 1 day')::date;
  seed_day date;
  student_row record;
  v_teacher_id integer;
  teacher_position integer;
  schedule_id bigint := 0;
  report_id bigint := 0;
  usage_id bigint := 0;
  slot_label text;
  slot_start text;
  schedule_note text;
  is_cancelled boolean;
  is_absent boolean;
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  perform set_config('cn_demo.reset_context', 'on', true);

  delete from cn_demo.sessions;
  delete from cn_demo.uploads;
  delete from cn_demo.login_rate_limits;
  delete from cn_demo.notifications;
  delete from cn_demo.report_drafts;
  delete from cn_demo.class_usage;
  delete from cn_demo.reports;
  delete from cn_demo.class_transactions;
  delete from cn_demo.schedules;
  delete from cn_demo.students where not is_baseline;
  delete from cn_demo.teachers where not is_baseline;
  delete from cn_demo.admins where not is_baseline;
  delete from cn_demo.activity_logs;

  insert into cn_demo.admins (id, username, password_hash, fullname, status, protected, is_baseline)
  values (1, 'admin', extensions.crypt('password', extensions.gen_salt('bf', 10)), 'Preview Administrator', 'Active', true, true)
  on conflict (id) do update set
    username = excluded.username,
    password_hash = excluded.password_hash,
    fullname = excluded.fullname,
    status = 'Active',
    language = 'en',
    protected = true,
    is_baseline = true;

  insert into cn_demo.teachers (id, username, password_hash, fullname, color, status, protected, is_baseline)
  values
    (1, 'testteacher', extensions.crypt('password', extensions.gen_salt('bf', 10)), 'Grace Mendoza', '#2563eb', 'Active', true, true),
    (2, 'amanda.reyes', extensions.crypt('T8v!kP2q#rL9mX4z', extensions.gen_salt('bf', 10)), 'Amanda Reyes', '#7c3aed', 'Active', false, true),
    (3, 'miguel.santos', extensions.crypt('N4s$wQ8y@bR6tC2p', extensions.gen_salt('bf', 10)), 'Miguel Santos', '#059669', 'Active', false, true),
    (4, 'sophia.lim', extensions.crypt('H7p&dV5x!aK3nS9u', extensions.gen_salt('bf', 10)), 'Sophia Lim', '#dc2626', 'Active', false, true)
  on conflict (id) do update set
    username = excluded.username,
    password_hash = excluded.password_hash,
    fullname = excluded.fullname,
    color = excluded.color,
    status = excluded.status,
    language = 'en',
    protected = excluded.protected,
    is_baseline = true;

  insert into cn_demo.students (id, name, notes, teacher_id, status, username, password_hash, protected, is_baseline)
  values
    (1, 'Emma Chen', 'Age 10 · Quezon City', 1, 'Active', 'teststudent', extensions.crypt('password', extensions.gen_salt('bf', 10)), true, true),
    (2, 'Liam Garcia', 'Cebu · Beginner reader', 2, 'Active', 'liam.garcia', extensions.crypt('Q9m!zR4t#vB7nL2x', extensions.gen_salt('bf', 10)), false, true),
    (3, 'Ava Santos', 'Enjoys story-based lessons', 1, 'Active', 'ava.santos', extensions.crypt('P3x$hT8w@cN5jK7r', extensions.gen_salt('bf', 10)), false, true),
    (4, 'Noah Tan', 'Age 12 · Davao City', 3, 'Active', 'noah.tan', extensions.crypt('Z6r&vM2q!sD9pA4y', extensions.gen_salt('bf', 10)), false, true),
    (5, 'Mia Reyes', 'Working on pronunciation', 2, 'Active', 'mia.reyes', extensions.crypt('L8c#nW5u@jF2xV9m', extensions.gen_salt('bf', 10)), false, true),
    (6, 'Lucas Wong', 'Makati · Intermediate level', 4, 'Active', 'lucas.wong', extensions.crypt('R2y!kP7d#qH6sN4v', extensions.gen_salt('bf', 10)), false, true),
    (7, 'Zoe Kim', 'New student · Limited English', 3, 'Active', 'zoe.kim', extensions.crypt('M5t$vC9x@bL3qR8p', extensions.gen_salt('bf', 10)), false, true),
    (8, 'Ethan Cruz', 'Prefers visual activities', 4, 'Active', 'ethan.cruz', extensions.crypt('D7n!sK2w#pV8mQ5z', extensions.gen_salt('bf', 10)), false, true),
    (9, 'Sofia Navarro', 'Age 9 · Iloilo City', 2, 'Active', 'sofia.navarro', extensions.crypt('K4p&rT9y!hC6vM2x', extensions.gen_salt('bf', 10)), false, true),
    (10, 'Daniel Lee', 'Strong reader · Shy speaker', 1, 'Active', 'daniel.lee', extensions.crypt('V9x#qL3n@tS7pD5m', extensions.gen_salt('bf', 10)), false, true),
    (11, 'Isabella Ramos', 'Bacolod · Conversation focus', 3, 'Active', 'isabella.ramos', extensions.crypt('B6m!wR8c#nK4yT2q', extensions.gen_salt('bf', 10)), false, true),
    (12, 'Chloe Villanueva', 'Preparing for school interview', 4, 'Active', 'chloe.villanueva', extensions.crypt('F7q@xM3v!nR9kD5s', extensions.gen_salt('bf', 10)), false, true),
    (13, 'Jacob Flores', 'Age 11 · Pasig City', 2, 'Active', 'jacob.flores', extensions.crypt('Y4p#tL8w@cN2mV6r', extensions.gen_salt('bf', 10)), false, true),
    (14, 'Hannah Sy', 'Needs help with sentence building', 1, 'Active', 'hannah.sy', extensions.crypt('J9s!bK5x&dQ3rT7m', extensions.gen_salt('bf', 10)), false, true),
    (15, 'Nathan Dela Cruz', 'Cagayan de Oro · Advanced reader', 3, 'Active', 'nathan.delacruz', extensions.crypt('C6v$hP2n@wM8yR4q', extensions.gen_salt('bf', 10)), false, true),
    (16, 'Olivia Park', 'New student · Phonics focus', 4, 'Active', 'olivia.park', extensions.crypt('S3m!zT7k#pV5dL9x', extensions.gen_salt('bf', 10)), false, true)
  on conflict (id) do update set
    name = excluded.name,
    notes = excluded.notes,
    teacher_id = excluded.teacher_id,
    status = excluded.status,
    username = excluded.username,
    password_hash = excluded.password_hash,
    language = 'en',
    protected = excluded.protected,
    is_baseline = true;

  insert into cn_demo.class_transactions
    (id, student_id, receipt_no, type, total_classes, remaining_classes, teacher_id, status, amount, transaction_no, date, notes, is_baseline)
  select
    s.id,
    s.id,
    format('DEMO-RC-%s', lpad(s.id::text, 3, '0')),
    'purchase',
    case when s.id = 9 then 18 else 40 end,
    case when s.id = 9 then 18 else 40 end,
    s.teacher_id,
    '',
    case when s.id = 9 then 180.00 else 400.00 end,
    format('DEMO-TXN-%s', lpad(s.id::text, 3, '0')),
    month_start,
    'Fictional preview purchase used for class-balance and receipt examples.',
    true
  from cn_demo.students s
  where s.id between 1 and 16;

  insert into cn_demo.class_transactions
    (id, student_id, receipt_no, type, total_classes, remaining_classes, teacher_id, status, amount, transaction_no, date, notes, is_baseline)
  values
    (50, 5, 'DEMO-MF-001', 'monthly-fee', 0, 0, 2, 'active', 800.00, 'DEMO-MF-TXN-001', month_start + 4, 'Fictional active monthly-fee preview account.', true),
    (51, 6, 'DEMO-MF-002', 'monthly-fee', 0, 0, 4, 'cancelled', 800.00, 'DEMO-MF-TXN-002', month_start + 5, 'Fictional monthly-fee account later cancelled.', true),
    (52, 6, 'DEMO-MF-002', 'cancel-monthly-fee', 0, 0, 4, '', null, 'DEMO-MF-CANCEL-002', month_start + 18, 'Fictional cancelled monthly-fee preview record.', true),
    (53, 9, 'DEMO-PROMO-001', 'promo', 2, 2, 2, '', 0.00, 'DEMO-PROMO-TXN-001', month_start + 7, 'Fictional free-class preview adjustment.', true);

  for seed_day in
    select d::date
    from generate_series(month_start, month_end, interval '1 day') as d
    where extract(isodow from d) between 1 and 5
  loop
    for v_teacher_id in 1..4 loop
      teacher_position := 0;

      for student_row in
        select s.id, s.name
        from cn_demo.students s
        where s.teacher_id = v_teacher_id
          and s.status = 'Active'
          and s.id between 1 and 16
        order by s.id
      loop
        teacher_position := teacher_position + 1;
        schedule_id := schedule_id + 1;

        slot_label := case v_teacher_id
          when 1 then (array['08:00 - 08:25', '08:30 - 08:55', '09:00 - 09:25', '10:30 - 10:55'])[teacher_position]
          when 2 then (array['13:00 - 13:25', '13:30 - 13:55', '14:00 - 14:25', '15:30 - 15:55'])[teacher_position]
          when 3 then (array['17:00 - 17:25', '17:30 - 17:55', '18:00 - 18:25', '19:30 - 19:55'])[teacher_position]
          else (array['19:00 - 19:25', '19:30 - 19:55', '20:00 - 20:25', '21:30 - 21:55'])[teacher_position]
        end;

        schedule_note := case
          when (extract(day from seed_day)::integer + student_row.id) % 11 = 0
            then 'New student; use short instructions and basic speaking prompts.'
          when (extract(day from seed_day)::integer + student_row.id) % 7 = 0
            then 'Oxford Discover 2, pages 34-37. Review the new vocabulary first.'
          when (extract(day from seed_day)::integer + student_row.id) % 5 = 0
            then 'Everybody Up 3, pages 18-20. Practice the dialogue twice.'
          else ''
        end;
        is_cancelled := (extract(day from seed_day)::integer + student_row.id) % 19 = 0;

        insert into cn_demo.schedules
          (id, teacher_id, date, timeslot, student, student_id, student_ids, note, trial, cancelled, cancel_reason, is_baseline)
        values (
          schedule_id,
          v_teacher_id,
          seed_day,
          slot_label,
          student_row.name,
          student_row.id,
          array[student_row.id]::bigint[],
          schedule_note,
          false,
          is_cancelled,
          case when is_cancelled then 'Fictional cancellation; no class balance is deducted.' else '' end,
          true
        );

        if seed_day <= least(p_logical_date, month_end) and not is_cancelled then
          report_id := report_id + 1;
          is_absent := (extract(day from seed_day)::integer + student_row.id) % 13 = 0;

          insert into cn_demo.reports
            (id, schedule_id, teacher_id, content, absent, images, date, link, book, pages, class_duration, absent_reason, absent_other, tracker_remarks, is_baseline)
          values (
            report_id,
            schedule_id,
            v_teacher_id,
            format(
              'Fictional preview report for %s: %s',
              student_row.name,
              case
                when is_absent then 'the student was absent after a guardian notice.'
                else 'the student completed the lesson and practiced speaking in full sentences.'
              end
            ),
            is_absent,
            '[]'::jsonb,
            seed_day,
            format('https://example.com/demo-class-session/%s', schedule_id),
            case (student_row.id % 4)
              when 0 then 'Reading Explorer Foundations'
              when 1 then 'Everybody Up 3'
              when 2 then 'Oxford Discover 2'
              else 'Conversation Builder'
            end,
            format('%s-%s', 12 + teacher_position, 15 + teacher_position),
            '25 mins',
            case when is_absent then 'Guardian Notice' else '' end,
            '',
            case when is_absent then '50' else '100' end,
            true
          );

          usage_id := usage_id + 1;
          slot_start := split_part(slot_label, ' - ', 1);
          insert into cn_demo.class_usage
            (id, transaction_id, schedule_id, date, time, duration, materials, pages, remarks, charged, is_baseline)
          values (
            usage_id,
            student_row.id,
            schedule_id,
            seed_day,
            slot_start,
            '25 mins',
            case (student_row.id % 4)
              when 0 then 'Reading Explorer Foundations'
              when 1 then 'Everybody Up 3'
              when 2 then 'Oxford Discover 2'
              else 'Conversation Builder'
            end,
            format('%s-%s', 12 + teacher_position, 15 + teacher_position),
            case when is_absent then 'Absent report consumed one class.' else 'Present report consumed one class.' end,
            true,
            true
          );
        end if;
      end loop;
    end loop;
  end loop;

  update cn_demo.class_transactions tx
  set remaining_classes = greatest(0, tx.total_classes - used.used_count),
      updated_at = clock_timestamp()
  from (
    select transaction_id, count(*)::integer as used_count
    from cn_demo.class_usage
    where charged
    group by transaction_id
  ) used
  where tx.id = used.transaction_id
    and tx.type = 'purchase';

  insert into cn_demo.notifications (message, type, student_name, student_id, read, created_at)
  values
    ('Fictional preview notice: Emma Chen has recent class activity and report history.', 'info', 'Emma Chen', 1, false, clock_timestamp()),
    ('Fictional preview notice: Sofia Navarro has a low remaining class balance.', 'warning', 'Sofia Navarro', 9, false, clock_timestamp()),
    ('Fictional preview data is restored after the daily reset.', 'info', '', null, false, clock_timestamp());

  insert into cn_demo.activity_logs (actor_role, actor_id, actor_name, method, path, action, status, details)
  values
    ('system', null, 'Daily reset', 'POST', '/reset', 'Restored realistic generated CN preview data', 200, '{"ok":true,"body":{"generated":true}}'),
    ('teacher', 1, 'Grace Mendoza', 'POST', '/reports', 'Submitted fictional present class report', 201, '{"ok":true,"body":{"absent":false}}'),
    ('teacher', 2, 'Amanda Reyes', 'POST', '/reports', 'Submitted fictional absent class report', 201, '{"ok":true,"body":{"absent":true}}'),
    ('teacher', 3, 'Miguel Santos', 'PATCH', '/schedules/cancel', 'Cancelled fictional preview class', 200, '{"ok":true,"body":{"cancelled":true}}');

  perform setval(pg_get_serial_sequence('cn_demo.admins', 'id'), greatest(999, (select max(id) from cn_demo.admins)), true);
  perform setval(pg_get_serial_sequence('cn_demo.teachers', 'id'), greatest(999, (select max(id) from cn_demo.teachers)), true);
  perform setval(pg_get_serial_sequence('cn_demo.students', 'id'), greatest(999, (select max(id) from cn_demo.students)), true);
  perform setval(pg_get_serial_sequence('cn_demo.schedules', 'id'), greatest(999, (select max(id) from cn_demo.schedules)), true);
  perform setval(pg_get_serial_sequence('cn_demo.reports', 'id'), greatest(999, (select max(id) from cn_demo.reports)), true);
  perform setval(pg_get_serial_sequence('cn_demo.class_transactions', 'id'), greatest(999, (select max(id) from cn_demo.class_transactions)), true);
  perform setval(pg_get_serial_sequence('cn_demo.class_usage', 'id'), greatest(999, (select max(id) from cn_demo.class_usage)), true);
end;
$$;

revoke all on function cn_demo.reset_demo_data(date) from public, anon, authenticated, service_role;

select cn_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

commit;
