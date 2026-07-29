import assert from 'node:assert/strict';

const key = process.env.CN_DEMO_PUBLISHABLE_KEY;
const supabaseUrl = process.env.SUPABASE_URL || 'https://ivqfxdibluhgyttgxbmz.supabase.co';
const origin = process.env.CN_DEMO_ORIGIN || 'https://cn-demo.pauuu.dev';
const endpoint = `${supabaseUrl}/functions/v1/cn-api`;

assert.match(key ?? '', /^sb_publishable_[A-Za-z0-9_-]+$/, 'CN public key is unavailable');

async function request(path, { method = 'GET', body, token } = {}) {
  return fetch(`${endpoint}${path}`, {
    method,
    headers: {
      apikey: key,
      origin,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

async function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: { username, password, remember_me: false },
  });
}

for (let attempt = 0; attempt < 9; attempt += 1) {
  const response = await login('admin', `wrong-preview-password-${attempt}`);
  assert.equal(response.status, 401, 'default admin must remain exempt from lockout');
}

const adminResponse = await login('admin', 'password');
assert.equal(adminResponse.status, 200, 'default admin login failed after exemption check');
const admin = await adminResponse.json();
assert.equal(typeof admin.token, 'string');

const rateCheckUsername = `ratecheck${Date.now().toString(36)}`;
for (let attempt = 0; attempt < 5; attempt += 1) {
  const response = await login(rateCheckUsername, `wrong-${attempt}`);
  assert.equal(response.status, 401, 'non-demo login should be counted before lockout');
}
assert.equal(
  (await login(rateCheckUsername, 'wrong-after-limit')).status,
  429,
  'non-demo login was not rate-limited',
);

const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const monthEnd = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate();
const start = `${year}-${month}-01`;
const end = `${year}-${month}-${String(monthEnd).padStart(2, '0')}`;
const auth = { token: admin.token };
const [studentsResponse, schedulesResponse, reportsResponse, balancesResponse] = await Promise.all([
  request('/students?limit=500', auth),
  request(`/schedules?start=${start}&end=${end}`, auth),
  request(`/reports?start=${start}&end=${end}`, auth),
  request('/class-balances', auth),
]);

for (const response of [studentsResponse, schedulesResponse, reportsResponse, balancesResponse]) {
  assert.equal(response.status, 200, 'authenticated CN preview read failed');
}

const [students, schedules, reports, balances] = await Promise.all([
  studentsResponse.json(),
  schedulesResponse.json(),
  reportsResponse.json(),
  balancesResponse.json(),
]);

assert.ok(students.length >= 16, 'expected at least 16 fictional students');
assert.ok(students.every((student) => student.username && student.notes), 'student identifiers are incomplete');
assert.ok(schedules.length > 0, 'current-month schedules are unavailable');
assert.ok(reports.length > 0, 'current-month reports are unavailable');
assert.ok(reports.every((report) => /^https:\/\/example\.com\/demo-class-session\/\d+$/.test(report.link)), 'dummy report links are incomplete');
assert.ok(balances.every((student) => student.username && student.notes), 'class balances omit student username or info');

const absentReports = reports.filter((report) => report.absent);
const absentReasons = new Set(absentReports.map((report) => report.absent_reason));
assert.deepEqual(
  [...absentReasons].sort(),
  ['Late Notice', 'No Notice', 'Other'].sort(),
  'preview absences must showcase all three absence reasons',
);
assert.ok(
  absentReports
    .filter((report) => report.absent_reason === 'Other')
    .every((report) => String(report.absent_other || '').trim()),
  'Other absences must include a short explanation',
);

const studentDays = new Set();
const teacherDays = new Map();
let notedSchedules = 0;
for (const schedule of schedules) {
  const weekday = new Date(`${schedule.date}T00:00:00Z`).getUTCDay();
  assert.notEqual(weekday, 0, 'Sunday schedule found');
  assert.notEqual(weekday, 6, 'Saturday schedule found');

  const studentDay = `${schedule.student_id}|${schedule.date}`;
  assert.ok(!studentDays.has(studentDay), `duplicate daily student schedule: ${studentDay}`);
  studentDays.add(studentDay);

  if (schedule.note) notedSchedules += 1;
  const teacherDay = `${schedule.teacher_id}|${schedule.date}`;
  const startMinutes = Number(schedule.timeslot.slice(0, 2)) * 60 + Number(schedule.timeslot.slice(3, 5));
  const slots = teacherDays.get(teacherDay) ?? [];
  slots.push(startMinutes);
  teacherDays.set(teacherDay, slots);
}

assert.ok(notedSchedules > 0 && notedSchedules < schedules.length, 'schedule notes must be selective');
for (const slots of teacherDays.values()) {
  slots.sort((a, b) => a - b);
  assert.equal(slots.length, 4, 'each teacher should have four daily preview classes');
  assert.ok(
    slots.some((slot, index) => index > 0 && slot - slots[index - 1] >= 90),
    'teacher day is missing its one-hour break',
  );
}

console.log(JSON.stringify({
  ok: true,
  defaultAccountsExempt: true,
  nonDemoRateLimit: true,
  students: students.length,
  schedules: schedules.length,
  reports: reports.length,
  absentReports: absentReports.length,
  absentReasons: [...absentReasons].sort(),
  selectiveNotes: notedSchedules,
  weekdaysOnly: true,
  oneClassPerStudentPerDay: true,
  teacherBreaks: true,
  reportLinks: true,
  balanceUsernames: true,
}, null, 2));
