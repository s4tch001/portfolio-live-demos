do $local_walkthrough$
begin
  perform set_config('cn_demo.reset_context', 'on', true);

  -- Keep the hosted daily reset job out of this isolated local walkthrough.
  update demo_control.applications
  set
    enabled = false,
    updated_at = clock_timestamp()
  where app_id = 'cn';

  delete from cn_demo.sessions;
  delete from cn_demo.uploads;
  delete from cn_demo.login_rate_limits;
  delete from cn_demo.notifications;
  delete from cn_demo.report_drafts;
  delete from cn_demo.class_usage;
  delete from cn_demo.reports;
  delete from cn_demo.schedules;
  delete from cn_demo.class_transactions;
  delete from cn_demo.activity_logs;
  delete from cn_demo.students;
  delete from cn_demo.teachers;
  delete from cn_demo.admins;

  insert into cn_demo.admins (
    id,
    username,
    password_hash,
    fullname,
    status,
    language,
    protected,
    is_baseline
  )
  values (
    1,
    'admin',
    extensions.crypt('password', extensions.gen_salt('bf', 10)),
    'Administrator',
    'Active',
    'en',
    true,
    true
  );

  insert into cn_demo.teachers (
    id,
    username,
    password_hash,
    fullname,
    color,
    status,
    language,
    protected,
    is_baseline
  )
  values (
    1,
    'testteacher',
    extensions.crypt('password', extensions.gen_salt('bf', 10)),
    'Preview Teacher',
    '#2563eb',
    'Active',
    'en',
    true,
    true
  );

  insert into cn_demo.students (
    id,
    name,
    notes,
    teacher_id,
    status,
    username,
    password_hash,
    language,
    protected,
    is_baseline
  )
  values (
    1,
    'Preview Student',
    '',
    1,
    'Active',
    'teststudent',
    extensions.crypt('password', extensions.gen_salt('bf', 10)),
    'en',
    true,
    true
  );

  perform setval(pg_get_serial_sequence('cn_demo.admins', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.teachers', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.students', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.schedules', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.reports', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.class_transactions', 'id'), 999, true);
  perform setval(pg_get_serial_sequence('cn_demo.class_usage', 'id'), 999, true);
end;
$local_walkthrough$;
