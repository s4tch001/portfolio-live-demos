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

async function jsonOk(path, options = {}) {
  const response = await request(path, options);
  const payload = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const admin = await jsonOk('/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'password', remember_me: false },
});
const auth = { token: admin.token };
const balances = await jsonOk('/class-balances', auth);
const student = balances
  .filter((row) => Number(row.balance) > 0)
  .sort((a, b) => Number(b.balance) - Number(a.balance))[0];
assert.ok(student, 'no student with a positive class balance is available');

const teacherId = 2;
const logicalDate = new Date().toISOString().slice(0, 10);
const startingBalance = Number(student.balance);
let scheduleId = 0;
let reportId = 0;
let cancelled = false;

async function currentBalance() {
  const rows = await jsonOk('/class-balances', auth);
  return Number(rows.find((row) => Number(row.id) === Number(student.id))?.balance);
}

try {
  const schedule = await jsonOk('/schedules', {
    ...auth,
    method: 'POST',
    body: {
      teacher_id: teacherId,
      date: logicalDate,
      timeslot: '23:30 - 23:55',
      student: student.name,
      student_id: student.id,
      note: 'Temporary automated receipt and balance verification.',
      trial: false,
    },
  });
  scheduleId = Number(schedule.id);

  const report = await jsonOk('/reports', {
    ...auth,
    method: 'POST',
    body: {
      schedule_id: scheduleId,
      teacher_id: teacherId,
      content: 'Temporary completed-class verification report.',
      absent: false,
      images: [],
      date: logicalDate,
      link: 'https://example.com/demo-class-session/verification',
      book: 'Receipt Verification',
      pages: '1-2',
      class_duration: '25 mins',
      absent_reason: '',
      absent_other: '',
      tracker_remarks: 'Completed preview verification',
    },
  });
  reportId = Number(report.id);

  assert.equal(await currentBalance(), startingBalance - 1, 'present report did not deduct exactly one class');

  let usage = await jsonOk(`/class-usage?schedule_id=${scheduleId}`, auth);
  assert.equal(usage.length, 1, 'completed schedule should have exactly one charged usage row');
  assert.equal(Number(usage[0].schedule_teacher_id), teacherId, 'receipt usage omitted the scheduled teacher');
  assert.equal(Number(usage[0].report_id), reportId, 'receipt usage omitted the filed report');
  assert.equal(usage[0].report_tracker_remarks, 'Completed preview verification', 'receipt usage omitted report remarks');

  await jsonOk(`/reports/${reportId}`, {
    ...auth,
    method: 'PUT',
    body: {
      schedule_id: scheduleId,
      teacher_id: teacherId,
      content: 'Temporary absent-class verification report.',
      absent: true,
      images: [],
      date: logicalDate,
      link: 'https://example.com/demo-class-session/verification',
      book: 'Receipt Verification',
      pages: '1-2',
      class_duration: '25 mins',
      absent_reason: 'Late Notice',
      absent_other: '',
      tracker_remarks: 'Late notice received',
    },
  });

  assert.equal(await currentBalance(), startingBalance - 1, 'editing a completed report deducted the class twice');
  usage = await jsonOk(`/class-usage?schedule_id=${scheduleId}`, auth);
  assert.equal(usage.length, 1, 'report edit created duplicate class usage');
  assert.equal(usage[0].report_absent, true, 'receipt usage did not reflect the absent report');
  assert.equal(usage[0].report_absent_reason, 'Late Notice', 'receipt usage omitted the absence remarks');

  await jsonOk(`/schedules/${scheduleId}/cancel`, {
    ...auth,
    method: 'POST',
    body: { reason: 'Automated verification cleanup.' },
  });
  cancelled = true;
  assert.equal(await currentBalance(), startingBalance, 'cancelled class did not restore the deducted balance');
} finally {
  if (scheduleId) {
    if (!cancelled) {
      await request(`/schedules/${scheduleId}/cancel`, {
        ...auth,
        method: 'POST',
        body: { reason: 'Automated verification cleanup after failure.' },
      });
    }
    await request(`/schedules/${scheduleId}`, { ...auth, method: 'DELETE' });
  }
}

assert.equal(await currentBalance(), startingBalance, 'verification cleanup did not restore the original balance');

console.log(JSON.stringify({
  ok: true,
  scheduledTeacherShown: true,
  reportRemarksShown: true,
  presentDeductsOne: true,
  absentRemainsDeductedOnce: true,
  reportEditIsIdempotent: true,
  cancellationRestoresBalance: true,
  cleanupComplete: true,
}, null, 2));
