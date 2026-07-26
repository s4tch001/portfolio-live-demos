begin;

alter table cn_demo.activity_logs
  add column if not exists actor_name text not null default '' check (length(actor_name) <= 120),
  add column if not exists method text not null default 'GET' check (length(method) between 1 and 10),
  add column if not exists path text not null default '/' check (length(path) between 1 and 200),
  add column if not exists details text not null default '' check (length(details) <= 12000);

create or replace function cn_demo.protect_demo_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(new.username, '')) = 'devpau' then
    raise exception using errcode = '23514', message = 'reserved demo username';
  end if;

  if tg_op = 'DELETE' and old.protected and current_setting('cn_demo.reset_context', true) <> 'on' then
    raise exception using errcode = '42501', message = 'protected demo account';
  end if;

  if tg_op = 'UPDATE' and old.protected and current_setting('cn_demo.reset_context', true) <> 'on' then
    if new.username is distinct from old.username or new.password_hash is distinct from old.password_hash then
      raise exception using errcode = '42501', message = 'protected demo credential';
    end if;

    if tg_table_name = 'admins' and new.status is distinct from 'Active' then
      raise exception using errcode = '42501', message = 'protected demo admin must stay active';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function cn_demo.reset_demo_data(p_logical_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_logical_date)::date;
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
  delete from cn_demo.reports where not is_baseline;
  delete from cn_demo.class_transactions where not is_baseline;
  delete from cn_demo.schedules where not is_baseline;
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

  insert into cn_demo.schedules (id, teacher_id, date, timeslot, student, student_id, student_ids, note, trial, cancelled, cancel_reason, is_baseline)
  values
    (1, 1, month_start + 1, '09:00 - 09:30', 'Emma Chen', 1, array[1]::bigint[], 'Generated present class for preview reports.', false, false, '', true),
    (2, 2, month_start + 2, '10:00 - 10:45', 'Liam Garcia', 2, array[2]::bigint[], 'Generated absent class for preview reports.', false, false, '', true),
    (3, 1, month_start + 3, '14:00 - 14:45', 'Ava Santos, Daniel Lee', 3, array[3,10]::bigint[], 'Generated group class for preview reports.', false, false, '', true),
    (4, 3, month_start + 4, '16:00 - 16:30', 'Noah Tan', 4, array[4]::bigint[], 'Generated cancelled class with no class deduction.', false, true, 'Student requested a makeup class.', true),
    (5, 4, month_start + 6, '11:00 - 11:30', 'Lucas Wong', 6, array[6]::bigint[], 'Generated completed class for another teacher.', false, false, '', true),
    (6, 2, month_start + 8, '13:00 - 13:30', 'Mia Reyes', 5, array[5]::bigint[], 'Generated upcoming class.', false, false, '', true),
    (7, 3, month_start + 10, '15:00 - 15:45', 'Zoe Kim', 7, array[7]::bigint[], 'Generated upcoming class.', false, false, '', true),
    (8, 4, month_start + 12, '09:30 - 10:00', 'Ethan Cruz', 8, array[8]::bigint[], 'Generated no-report class.', false, false, '', true),
    (9, 2, month_start + 14, '17:00 - 17:30', 'Sofia Navarro', 9, array[9]::bigint[], 'Generated low-balance student class.', false, false, '', true),
    (10, 1, month_start + 16, '18:00 - 18:30', 'Isabella Ramos', 11, array[11]::bigint[], 'Generated trial-style showcase class.', true, false, '', true),
    (11, 3, month_start + 18, '10:30 - 11:00', 'Noah Tan, Zoe Kim', 4, array[4,7]::bigint[], 'Generated future group class.', false, false, '', true),
    (12, 4, month_start + 22, '19:00 - 19:45', 'Lucas Wong, Ethan Cruz', 6, array[6,8]::bigint[], 'Generated future group class.', false, false, '', true)
  on conflict (id) do update set
    teacher_id = excluded.teacher_id,
    date = excluded.date,
    timeslot = excluded.timeslot,
    student = excluded.student,
    student_id = excluded.student_id,
    student_ids = excluded.student_ids,
    note = excluded.note,
    trial = excluded.trial,
    cancelled = excluded.cancelled,
    cancel_reason = excluded.cancel_reason,
    is_baseline = true;

  insert into cn_demo.reports (id, schedule_id, teacher_id, content, absent, date, book, pages, class_duration, absent_reason, absent_other, tracker_remarks, is_baseline)
  values
    (1, 1, 1, 'Generated preview report: Emma practiced short answers, pronunciation, and confidence speaking.', false, month_start + 1, 'Everybody Up 2', '18-21', '30 minutes', '', '', 'Present - strong participation.', true),
    (2, 2, 2, 'Generated preview report: Liam was absent after late notice from the guardian.', true, month_start + 2, 'Oxford Discover 1', '34-35', '45 minutes', 'Late Notice', '', 'Absent - late notice.', true),
    (3, 3, 1, 'Generated preview report: Ava and Daniel practiced role-play questions and sentence building.', false, month_start + 3, 'Conversation Builder', '12-16', '45 minutes', '', '', 'Present - group practice completed.', true),
    (4, 5, 4, 'Generated preview report: Lucas reviewed reading fluency and answered comprehension questions.', false, month_start + 6, 'Reading Explorer Foundations', '42-45', '30 minutes', '', '', 'Present - reading fluency improved.', true)
  on conflict (id) do update set
    schedule_id = excluded.schedule_id,
    teacher_id = excluded.teacher_id,
    content = excluded.content,
    absent = excluded.absent,
    date = excluded.date,
    book = excluded.book,
    pages = excluded.pages,
    class_duration = excluded.class_duration,
    absent_reason = excluded.absent_reason,
    absent_other = excluded.absent_other,
    tracker_remarks = excluded.tracker_remarks,
    images = '[]'::jsonb,
    submitted_at = clock_timestamp(),
    link = '',
    is_baseline = true;

  insert into cn_demo.class_transactions (id, student_id, receipt_no, type, total_classes, remaining_classes, teacher_id, status, transaction_no, date, notes, is_baseline)
  values
    (1, 1, 'DEMO-RC-001', 'purchase', 3, 2, 1, '', 'DEMO-TXN-001', month_start, 'Generated low-balance preview purchase. One reported class consumed.', true),
    (2, 2, 'DEMO-RC-002', 'purchase', 10, 9, 2, '', 'DEMO-TXN-002', month_start, 'Generated preview purchase. Absent report consumed one class.', true),
    (3, 3, 'DEMO-RC-003', 'purchase', 8, 7, 1, '', 'DEMO-TXN-003', month_start, 'Generated preview purchase. Group report consumed one class.', true),
    (4, 4, 'DEMO-RC-004', 'purchase', 8, 8, 3, '', 'DEMO-TXN-004', month_start, 'Generated preview purchase. Cancelled class did not consume balance.', true),
    (5, 5, 'DEMO-RC-005', 'purchase', 8, 8, 2, '', 'DEMO-TXN-005', month_start, 'Generated preview purchase.', true),
    (6, 6, 'DEMO-RC-006', 'purchase', 6, 5, 4, '', 'DEMO-TXN-006', month_start, 'Generated preview purchase. One reported class consumed.', true),
    (7, 7, 'DEMO-RC-007', 'purchase', 6, 6, 3, '', 'DEMO-TXN-007', month_start, 'Generated preview purchase.', true),
    (8, 8, 'DEMO-RC-008', 'purchase', 5, 5, 4, '', 'DEMO-TXN-008', month_start, 'Generated preview purchase.', true),
    (9, 9, 'DEMO-RC-009', 'purchase', 3, 2, 2, '', 'DEMO-TXN-009', month_start, 'Generated low-balance preview purchase.', true),
    (10, 10, 'DEMO-RC-010', 'purchase', 8, 7, 1, '', 'DEMO-TXN-010', month_start, 'Generated preview purchase. Group report consumed one class.', true),
    (11, 11, 'DEMO-RC-011', 'purchase', 4, 4, 3, '', 'DEMO-TXN-011', month_start, 'Generated preview purchase.', true)
  on conflict (id) do update set
    student_id = excluded.student_id,
    receipt_no = excluded.receipt_no,
    type = excluded.type,
    total_classes = excluded.total_classes,
    remaining_classes = excluded.remaining_classes,
    teacher_id = excluded.teacher_id,
    status = excluded.status,
    transaction_no = excluded.transaction_no,
    date = excluded.date,
    notes = excluded.notes,
    from_student_id = null,
    amount = null,
    due_date = null,
    updated_at = clock_timestamp(),
    is_baseline = true;

  insert into cn_demo.class_usage (id, transaction_id, schedule_id, date, time, duration, materials, pages, remarks, charged, is_baseline)
  values
    (1, 1, 1, month_start + 1, '09:00', '30 minutes', 'Everybody Up 2', '18-21', 'Present - generated preview usage.', true, true),
    (2, 2, 2, month_start + 2, '10:00', '45 minutes', 'Oxford Discover 1', '34-35', 'Absent - late notice, generated preview usage.', true, true),
    (3, 3, 3, month_start + 3, '14:00', '45 minutes', 'Conversation Builder', '12-16', 'Present - generated group usage.', true, true),
    (4, 10, 3, month_start + 3, '14:00', '45 minutes', 'Conversation Builder', '12-16', 'Present - generated group usage.', true, true),
    (5, 6, 5, month_start + 6, '11:00', '30 minutes', 'Reading Explorer Foundations', '42-45', 'Present - generated preview usage.', true, true)
  on conflict (id) do update set
    transaction_id = excluded.transaction_id,
    schedule_id = excluded.schedule_id,
    date = excluded.date,
    time = excluded.time,
    duration = excluded.duration,
    materials = excluded.materials,
    pages = excluded.pages,
    remarks = excluded.remarks,
    charged = true,
    is_baseline = true;

  insert into cn_demo.notifications (message, type, student_name, student_id, read, created_at)
  values
    ('Generated preview notice: Emma Chen has a low remaining class balance.', 'warning', 'Emma Chen', 1, false, clock_timestamp()),
    ('Generated preview notice: Sofia Navarro has a low remaining class balance.', 'warning', 'Sofia Navarro', 9, false, clock_timestamp()),
    ('Generated preview notice: this demo data is restored after the daily reset.', 'info', '', null, false, clock_timestamp());

  insert into cn_demo.activity_logs (actor_role, actor_id, actor_name, method, path, action, status, details)
  values
    ('system', null, 'Daily reset', 'POST', '/reset', 'Restored generated CN preview data', 200, '{"ok":true,"body":{"generated":true}}'),
    ('teacher', 1, 'Grace Mendoza', 'POST', '/reports', 'Submitted class report', 201, '{"ok":true,"body":{"schedule_id":1,"absent":false}}'),
    ('teacher', 2, 'Amanda Reyes', 'POST', '/reports', 'Submitted class report', 201, '{"ok":true,"body":{"schedule_id":2,"absent":true}}'),
    ('admin', 1, 'Preview Administrator', 'GET', '/class-balances', 'Viewed class balances', 200, '{"ok":true,"body":{"generated":true}}');

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
  leader_a constant uuid := '10000000-0000-4000-8000-000000000001';
  leader_b constant uuid := '10000000-0000-4000-8000-000000000002';
  leader_c constant uuid := '10000000-0000-4000-8000-000000000003';
begin
  if p_logical_date is null then
    raise exception using errcode = '22004', message = 'logical date is required';
  end if;

  perform set_config('rcmi_demo.reset_context', 'on', true);
  delete from rcmi_demo.admin_sessions;
  delete from rcmi_demo.login_rate_limits;
  delete from rcmi_demo.mutation_rate_limits;
  delete from rcmi_demo.attendance;
  delete from rcmi_demo.member_role_history;
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
    ('10000000-0000-4000-8000-000000000012', 'Rafael Torres', 'guest', leader_c, null, true, true, month_start - 8);

  insert into rcmi_demo.member_role_history (id, member_id, role, leader_id, effective_date, is_baseline)
  select
    ('20000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
    id,
    role,
    leader_id,
    created_at,
    true
  from rcmi_demo.members;

  insert into rcmi_demo.attendance (attendance_date, member_id, is_baseline)
  values
    (month_start + 2, leader_a, true),
    (month_start + 2, leader_b, true),
    (month_start + 2, '10000000-0000-4000-8000-000000000004', true),
    (month_start + 2, '10000000-0000-4000-8000-000000000005', true),
    (month_start + 2, '10000000-0000-4000-8000-000000000010', true),
    (month_start + 9, leader_a, true),
    (month_start + 9, leader_c, true),
    (month_start + 9, '10000000-0000-4000-8000-000000000004', true),
    (month_start + 9, '10000000-0000-4000-8000-000000000008', true),
    (month_start + 9, '10000000-0000-4000-8000-000000000012', true),
    (month_start + 16, leader_b, true),
    (month_start + 16, leader_c, true),
    (month_start + 16, '10000000-0000-4000-8000-000000000006', true),
    (month_start + 16, '10000000-0000-4000-8000-000000000007', true),
    (month_start + 16, '10000000-0000-4000-8000-000000000009', true),
    (month_start + 23, leader_a, true),
    (month_start + 23, leader_b, true),
    (month_start + 23, leader_c, true),
    (month_start + 23, '10000000-0000-4000-8000-000000000005', true),
    (month_start + 23, '10000000-0000-4000-8000-000000000011', true);

  insert into rcmi_demo.app_settings (key, value, protected)
  values
    ('district_leader.pastor-sherwin', 'Pastor Sherwin', false),
    ('district_leader.ate-anj', 'Ate Anj', false),
    ('admin_password_hash', extensions.crypt('password', extensions.gen_salt('bf', 10)), true)
  on conflict (key) do update set
    value = excluded.value,
    protected = excluded.protected,
    updated_at = clock_timestamp();
end;
$$;

select cn_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);
select rcmi_demo.reset_demo_data((clock_timestamp() at time zone 'Asia/Manila')::date);

commit;
