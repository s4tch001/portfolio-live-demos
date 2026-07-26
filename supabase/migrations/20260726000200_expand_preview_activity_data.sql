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
  teacher_id integer;
  slot_index integer;
  schedule_id bigint := 0;
  report_id bigint := 0;
  usage_id bigint := 0;
  student_id bigint;
  student_name text;
  slot_label text;
  slot_start text;
  is_cancelled boolean;
  is_absent boolean;
  report_limit integer := 72;
  slot_labels text[] := array[
    '10:00 - 10:25',
    '10:30 - 10:55',
    '11:00 - 11:25',
    '11:30 - 11:55',
    '12:00 - 12:25',
    '12:30 - 12:55',
    '13:00 - 13:25',
    '13:30 - 13:55',
    '14:00 - 14:25',
    '14:30 - 14:55',
    '15:00 - 15:25',
    '15:30 - 15:55',
    '16:00 - 16:25',
    '16:30 - 16:55',
    '17:00 - 17:25'
  ];
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
    (1, 'Emma Chen', 'Generated preview student with parent-visible schedules and reports.', 1, 'Active', 'teststudent', extensions.crypt('password', extensions.gen_salt('bf', 10)), true, true),
    (2, 'Liam Garcia', 'Generated preview student for class-balance testing.', 2, 'Active', 'liam.garcia', extensions.crypt('Q9m!zR4t#vB7nL2x', extensions.gen_salt('bf', 10)), false, true),
    (3, 'Ava Santos', 'Generated preview student for group-class testing.', 1, 'Active', 'ava.santos', extensions.crypt('P3x$hT8w@cN5jK7r', extensions.gen_salt('bf', 10)), false, true),
    (4, 'Noah Tan', 'Generated preview student with an absent report.', 3, 'Active', 'noah.tan', extensions.crypt('Z6r&vM2q!sD9pA4y', extensions.gen_salt('bf', 10)), false, true),
    (5, 'Mia Reyes', 'Generated preview student with upcoming classes.', 2, 'Active', 'mia.reyes', extensions.crypt('L8c#nW5u@jF2xV9m', extensions.gen_salt('bf', 10)), false, true),
    (6, 'Lucas Wong', 'Generated preview student with cancelled class data.', 4, 'Active', 'lucas.wong', extensions.crypt('R2y!kP7d#qH6sN4v', extensions.gen_salt('bf', 10)), false, true),
    (7, 'Zoe Kim', 'Generated preview student for schedule variety.', 3, 'Active', 'zoe.kim', extensions.crypt('M5t$vC9x@bL3qR8p', extensions.gen_salt('bf', 10)), false, true),
    (8, 'Ethan Cruz', 'Generated preview student for remaining-class reports.', 4, 'Active', 'ethan.cruz', extensions.crypt('D7n!sK2w#pV8mQ5z', extensions.gen_salt('bf', 10)), false, true),
    (9, 'Sofia Navarro', 'Generated preview student for low-balance notification.', 2, 'Active', 'sofia.navarro', extensions.crypt('K4p&rT9y!hC6vM2x', extensions.gen_salt('bf', 10)), false, true),
    (10, 'Daniel Lee', 'Generated preview student for teacher schedule variety.', 1, 'Active', 'daniel.lee', extensions.crypt('V9x#qL3n@tS7pD5m', extensions.gen_salt('bf', 10)), false, true),
    (11, 'Isabella Ramos', 'Generated preview student for monthly schedule density.', 3, 'Active', 'isabella.ramos', extensions.crypt('B6m!wR8c#nK4yT2q', extensions.gen_salt('bf', 10)), false, true)
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

  insert into cn_demo.class_transactions (id, student_id, receipt_no, type, total_classes, remaining_classes, teacher_id, status, amount, transaction_no, date, notes, is_baseline)
  values
    (1, 1, 'DEMO-RC-001', 'purchase', 36, 36, 1, '', 360.00, 'DEMO-TXN-001', month_start, 'Generated preview purchase used by class-usage reports.', true),
    (2, 2, 'DEMO-RC-002', 'purchase', 36, 36, 2, '', 360.00, 'DEMO-TXN-002', month_start, 'Generated preview purchase used by absent report examples.', true),
    (3, 3, 'DEMO-RC-003', 'purchase', 36, 36, 1, '', 360.00, 'DEMO-TXN-003', month_start, 'Generated preview purchase.', true),
    (4, 4, 'DEMO-RC-004', 'purchase', 36, 36, 3, '', 360.00, 'DEMO-TXN-004', month_start, 'Generated preview purchase. Cancelled classes do not deduct from this balance.', true),
    (5, 5, 'DEMO-RC-005', 'purchase', 36, 36, 2, '', 360.00, 'DEMO-TXN-005', month_start, 'Generated preview purchase.', true),
    (6, 6, 'DEMO-RC-006', 'purchase', 36, 36, 4, '', 360.00, 'DEMO-TXN-006', month_start, 'Generated preview purchase.', true),
    (7, 7, 'DEMO-RC-007', 'purchase', 36, 36, 3, '', 360.00, 'DEMO-TXN-007', month_start, 'Generated preview purchase.', true),
    (8, 8, 'DEMO-RC-008', 'purchase', 36, 36, 4, '', 360.00, 'DEMO-TXN-008', month_start, 'Generated preview purchase.', true),
    (9, 9, 'DEMO-RC-009', 'purchase', 12, 12, 2, '', 120.00, 'DEMO-TXN-009', month_start, 'Generated low-balance preview purchase.', true),
    (10, 10, 'DEMO-RC-010', 'purchase', 36, 36, 1, '', 360.00, 'DEMO-TXN-010', month_start, 'Generated preview purchase.', true),
    (11, 11, 'DEMO-RC-011', 'purchase', 24, 24, 3, '', 240.00, 'DEMO-TXN-011', month_start, 'Generated preview purchase.', true),
    (50, 5, 'DEMO-MF-001', 'monthly-fee', 0, 0, 2, 'active', 800.00, 'DEMO-MF-TXN-001', month_start + 4, 'Generated active monthly-fee preview account.', true),
    (51, 6, 'DEMO-MF-002', 'monthly-fee', 0, 0, 4, 'cancelled', 800.00, 'DEMO-MF-TXN-002', month_start + 5, 'Generated monthly-fee account later cancelled.', true),
    (52, 6, 'DEMO-MF-002', 'cancel-monthly-fee', 0, 0, 4, '', null, 'DEMO-MF-CANCEL-002', month_start + 18, 'Generated cancelled monthly-fee preview record.', true),
    (53, 9, 'DEMO-PROMO-001', 'promo', 2, 2, 2, '', 0.00, 'DEMO-PROMO-TXN-001', month_start + 7, 'Generated free-class preview adjustment.', true)
  on conflict (id) do update set
    student_id = excluded.student_id,
    receipt_no = excluded.receipt_no,
    type = excluded.type,
    total_classes = excluded.total_classes,
    remaining_classes = excluded.remaining_classes,
    teacher_id = excluded.teacher_id,
    status = excluded.status,
    amount = excluded.amount,
    transaction_no = excluded.transaction_no,
    date = excluded.date,
    notes = excluded.notes,
    from_student_id = null,
    due_date = null,
    updated_at = clock_timestamp(),
    is_baseline = true;

  for seed_day in
    select d::date
    from generate_series(month_start, month_end, interval '1 day') as d
    where extract(isodow from d) between 1 and 5
  loop
    for teacher_id in 1..4 loop
      for slot_index in 1..array_length(slot_labels, 1) loop
        schedule_id := schedule_id + 1;
        student_id := (((extract(day from seed_day)::integer + teacher_id::integer + slot_index) % 11) + 1);
        select s.name into student_name from cn_demo.students s where s.id = student_id;
        slot_label := slot_labels[slot_index];
        is_cancelled := schedule_id % 19 = 0;
        insert into cn_demo.schedules (id, teacher_id, date, timeslot, student, student_id, student_ids, note, trial, cancelled, cancel_reason, is_baseline)
        values (
          schedule_id,
          teacher_id,
          seed_day,
          slot_label,
          student_name,
          student_id,
          array[student_id]::bigint[],
          'Generated current-month preview schedule using the default 25-minute class slots. Teachers rest on weekends.',
          false,
          is_cancelled,
          case when is_cancelled then 'Generated preview cancellation; no class balance is deducted.' else '' end,
          true
        );

        if report_id < report_limit and seed_day <= least(month_start + 20, month_end) then
          is_absent := schedule_id % 11 = 0;
          if not is_cancelled then
            report_id := report_id + 1;
            insert into cn_demo.reports (id, schedule_id, teacher_id, content, absent, date, book, pages, class_duration, absent_reason, absent_other, tracker_remarks, is_baseline)
            values (
              report_id,
              schedule_id,
              teacher_id,
              format(
                'Generated preview report for %s: %s',
                student_name,
                case when is_absent then 'student was marked absent with a guardian notice.' else 'student completed speaking, reading, and review activities.' end
              ),
              is_absent,
              seed_day,
              case (slot_index % 4) when 0 then 'Reading Explorer Foundations' when 1 then 'Everybody Up 2' when 2 then 'Oxford Discover 1' else 'Conversation Builder' end,
              format('%s-%s', 10 + slot_index, 13 + slot_index),
              '25 mins',
              case when is_absent then 'Late Notice' else '' end,
              '',
              case when is_absent then 'Absent - generated preview data.' else 'Present - generated preview data.' end,
              true
            );
            usage_id := usage_id + 1;
            slot_start := split_part(slot_label, ' - ', 1);
            insert into cn_demo.class_usage (id, transaction_id, schedule_id, date, time, duration, materials, pages, remarks, charged, is_baseline)
            values (
              usage_id,
              student_id,
              schedule_id,
              seed_day,
              slot_start,
              '25 mins',
              case (slot_index % 4) when 0 then 'Reading Explorer Foundations' when 1 then 'Everybody Up 2' when 2 then 'Oxford Discover 1' else 'Conversation Builder' end,
              format('%s-%s', 10 + slot_index, 13 + slot_index),
              case when is_absent then 'Absent report consumed one class in this demo.' else 'Present report consumed one class in this demo.' end,
              true,
              true
            );
          end if;
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
    ('Generated preview notice: Emma Chen has recent class activity and a visible report history.', 'info', 'Emma Chen', 1, false, clock_timestamp()),
    ('Generated preview notice: Sofia Navarro has a low remaining class balance.', 'warning', 'Sofia Navarro', 9, false, clock_timestamp()),
    ('Generated preview notice: this demo data is restored after the daily reset.', 'info', '', null, false, clock_timestamp());

  insert into cn_demo.activity_logs (actor_role, actor_id, actor_name, method, path, action, status, details)
  values
    ('system', null, 'Daily reset', 'POST', '/reset', 'Restored expanded generated CN preview data', 200, '{"ok":true,"body":{"generated":true}}'),
    ('teacher', 1, 'Grace Mendoza', 'POST', '/reports', 'Submitted generated present class report', 201, '{"ok":true,"body":{"absent":false}}'),
    ('teacher', 2, 'Amanda Reyes', 'POST', '/reports', 'Submitted generated absent class report', 201, '{"ok":true,"body":{"absent":true}}'),
    ('teacher', 3, 'Miguel Santos', 'PATCH', '/schedules/cancel', 'Cancelled generated preview class', 200, '{"ok":true,"body":{"cancelled":true}}'),
    ('admin', 1, 'Preview Administrator', 'GET', '/receipts', 'Viewed generated receipt samples', 200, '{"ok":true,"body":{"generated":true}}'),
    ('admin', 1, 'Preview Administrator', 'GET', '/annual-summary', 'Viewed generated yearly summary samples', 200, '{"ok":true,"body":{"generated":true}}');

  perform setval(pg_get_serial_sequence('cn_demo.admins', 'id'), greatest(999, (select max(id) from cn_demo.admins)), true);
  perform setval(pg_get_serial_sequence('cn_demo.teachers', 'id'), greatest(999, (select max(id) from cn_demo.teachers)), true);
  perform setval(pg_get_serial_sequence('cn_demo.students', 'id'), greatest(999, (select max(id) from cn_demo.students)), true);
  perform setval(pg_get_serial_sequence('cn_demo.schedules', 'id'), greatest(999, (select max(id) from cn_demo.schedules)), true);
  perform setval(pg_get_serial_sequence('cn_demo.reports', 'id'), greatest(999, (select max(id) from cn_demo.reports)), true);
  perform setval(pg_get_serial_sequence('cn_demo.class_transactions', 'id'), greatest(999, (select max(id) from cn_demo.class_transactions)), true);
  perform setval(pg_get_serial_sequence('cn_demo.class_usage', 'id'), greatest(999, (select max(id) from cn_demo.class_usage)), true);
end;
$$;

create or replace function rcmi_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_logical_date)::date;
  month_end date := (date_trunc('month', p_logical_date)::date + interval '1 month - 1 day')::date;
  leader_a uuid := '10000000-0000-4000-8000-000000000001';
  leader_b uuid := '10000000-0000-4000-8000-000000000002';
  leader_c uuid := '10000000-0000-4000-8000-000000000003';
  service_day date;
  member_row record;
  member_index integer := 0;
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  perform set_config('rcmi_demo.reset_context', 'on', true);

  delete from rcmi_demo.admin_sessions;
  delete from rcmi_demo.mutation_rate_limits;
  delete from rcmi_demo.attendance;
  delete from rcmi_demo.member_role_history;
  delete from rcmi_demo.members where leader_id is not null;
  delete from rcmi_demo.members;

  insert into rcmi_demo.members (id, name, role, leader_id, district_leader_id, active, is_baseline, created_at)
  values
    (leader_a, 'Sherwin Alonzo', 'leader', null, 'pastor-sherwin', true, true, month_start - 120),
    (leader_b, 'Anj Villanueva', 'leader', null, 'ate-anj', true, true, month_start - 110),
    (leader_c, 'Clarissa Dela Cruz', 'leader', null, 'ate-anj', true, true, month_start - 95),
    ('10000000-0000-4000-8000-000000000004', 'Paolo Mendoza', 'member', leader_a, null, true, true, month_start - 80),
    ('10000000-0000-4000-8000-000000000005', 'Andrea Santos', 'member', leader_a, null, true, true, month_start - 70),
    ('10000000-0000-4000-8000-000000000006', 'Mark Reyes', 'member', leader_b, null, true, true, month_start - 65),
    ('10000000-0000-4000-8000-000000000007', 'Joyce Navarro', 'member', leader_b, null, true, true, month_start - 60),
    ('10000000-0000-4000-8000-000000000008', 'Nathan Cruz', 'member', leader_c, null, true, true, month_start - 45),
    ('10000000-0000-4000-8000-000000000009', 'Bianca Lim', 'member', leader_c, null, true, true, month_start - 40),
    ('10000000-0000-4000-8000-000000000010', 'Carlo Bautista', 'guest', leader_a, null, true, true, month_start - 20),
    ('10000000-0000-4000-8000-000000000011', 'Mika Fernandez', 'guest', leader_b, null, true, true, month_start - 15),
    ('10000000-0000-4000-8000-000000000012', 'Rafael Torres', 'guest', leader_c, null, true, true, month_start - 8),
    ('10000000-0000-4000-8000-000000000013', 'Elaine Dizon', 'member', leader_a, null, true, true, month_start - 75),
    ('10000000-0000-4000-8000-000000000014', 'Jomar Villanueva', 'member', leader_b, null, true, true, month_start - 55),
    ('10000000-0000-4000-8000-000000000015', 'Trisha Manalo', 'member', leader_c, null, true, true, month_start - 35),
    ('10000000-0000-4000-8000-000000000016', 'Kevin Soriano', 'guest', leader_a, null, true, true, month_start - 12);

  insert into rcmi_demo.member_role_history (member_id, role, leader_id, effective_date, is_baseline)
  select id, role, leader_id, created_at, true from rcmi_demo.members;

  for service_day in
    select d::date
    from generate_series(month_start, month_end, interval '1 day') as d
    where extract(isodow from d) in (3, 7)
  loop
    member_index := 0;
    for member_row in select id from rcmi_demo.members order by name loop
      member_index := member_index + 1;
      if member_index % 5 <> extract(day from service_day)::integer % 5 then
        insert into rcmi_demo.attendance (attendance_date, member_id, is_baseline)
        values (service_day, member_row.id, true)
        on conflict (attendance_date, member_id) do update set is_baseline = true;
      end if;
    end loop;
  end loop;
end;
$$;

select cn_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);
select rcmi_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

commit;
