import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://ivqfxdibluhgyttgxbmz.supabase.co';
const TIMEZONE = 'Asia/Manila';
const timeout = () => AbortSignal.timeout(20_000);
const keys = {
  cn: process.env.CN_DEMO_PUBLISHABLE_KEY,
  rcmi: process.env.RCMI_DEMO_PUBLISHABLE_KEY,
  hours: process.env.HOURS_DEMO_PUBLISHABLE_KEY,
};
const origins = {
  cn: 'https://cn-demo.pauuu.dev',
  rcmi: 'https://rcmi-demo.pauuu.dev',
  hours: 'https://hours-demo.pauuu.dev',
};

function manilaLogicalDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function request(app, path, { method = 'GET', body, token } = {}) {
  const key = keys[app];
  assert.match(key ?? '', /^sb_publishable_[A-Za-z0-9_-]+$/, `${app} public key is unavailable`);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${app}-api${path}`, {
    method,
    headers: {
      apikey: key,
      origin: origins[app],
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: timeout(),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.ok, true, `${app}${path} returned ${response.status}`);
  return payload;
}

const logicalDate = manilaLogicalDate();
const monthKey = logicalDate.slice(0, 7);
const [year, month] = monthKey.split('-').map(Number);
const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
const range = `start=${monthKey}-01&end=${monthKey}-${String(monthEnd).padStart(2, '0')}`;

const cnLogin = await request('cn', '/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'password' },
});
assert.equal(typeof cnLogin.token, 'string', 'CN admin session is unavailable');
const [schedules, reports, transactions] = await Promise.all([
  request('cn', `/schedules?${range}`, { token: cnLogin.token }),
  request('cn', `/reports?${range}`, { token: cnLogin.token }),
  request('cn', '/class-transactions', { token: cnLogin.token }),
]);
assert.ok(schedules.length > 0 && reports.length > 0 && transactions.length > 0, 'CN monthly baseline is incomplete');
assert.ok(schedules.every((row) => String(row.date).startsWith(`${monthKey}-`)), 'CN schedule escaped the Manila month');
assert.ok(reports.every((row) => String(row.date).startsWith(`${monthKey}-`)), 'CN report escaped the Manila month');
assert.ok(transactions.every((row) => String(row.date).startsWith(`${monthKey}-`)), 'CN transaction escaped the Manila month');
const absentReports = reports.filter((row) => row.absent);
const absentReasons = [...new Set(absentReports.map((row) => row.absent_reason))].sort();
assert.deepEqual(absentReasons, ['Late Notice', 'No Notice', 'Other'].sort(), 'CN absence examples are incomplete');

const [rcmiMembers, rcmiAttendance] = await Promise.all([
  request('rcmi', '/members'),
  request('rcmi', `/attendance?mode=month&month=${String(month).padStart(2, '0')}-${year}`),
]);
assert.ok(rcmiMembers.members.length > 0, 'RCMI directory baseline is unavailable');
assert.ok(
  rcmiMembers.members.every((member) => String(member.createdAt).startsWith(`${monthKey}-`)),
  'RCMI member date escaped the Manila month',
);
const attendanceDates = Object.keys(rcmiAttendance.days ?? {});
assert.ok(attendanceDates.length > 0, 'RCMI attendance baseline is unavailable');
assert.ok(
  attendanceDates.every((date) => date.endsWith(`-${year}`) && date.startsWith(`${String(month).padStart(2, '0')}-`)),
  'RCMI attendance date escaped the Manila month',
);

const hoursLogin = await request('hours', '/session', {
  method: 'POST',
  body: { password: 'password' },
});
assert.equal(hoursLogin.logicalDate, logicalDate, 'Hours API returned the wrong Manila logical date');
const hours = await request('hours', `/entries?month=${monthKey}`, { token: hoursLogin.token });
assert.equal(hours.entries.length, 12, 'Hours monthly baseline count is incorrect');
assert.ok(hours.entries.every((row) => row.dateKey.startsWith(`${monthKey}-`)), 'Hours entry escaped the Manila month');

console.log(JSON.stringify({
  ok: true,
  timezone: TIMEZONE,
  logicalDate,
  monthKey,
  cn: {
    schedules: schedules.length,
    reports: reports.length,
    absentReports: absentReports.length,
    absentReasons,
    transactions: transactions.length,
  },
  rcmi: { members: rcmiMembers.members.length, attendanceDays: attendanceDates.length },
  hours: { entries: hours.entries.length },
}, null, 2));
