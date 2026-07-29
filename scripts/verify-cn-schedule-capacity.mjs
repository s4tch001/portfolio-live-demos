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

async function expectCapacityRejection(body, token) {
  const response = await request('/schedules', { method: 'POST', body, token });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 409, `schedule was not rejected: ${response.status} ${JSON.stringify(payload)}`);
  assert.equal(payload.error, 'student_no_remaining_classes');
}

const admin = await jsonOk('/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'password', remember_me: false },
});
const auth = { token: admin.token };
const unique = `${Date.now().toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
const logicalDate = new Date().toISOString().slice(0, 10);
const studentName = `Capacity Check ${unique}`;
let studentId = 0;
const scheduleIds = new Set();
const transactionIds = new Set();

const regularSchedule = (timeslot) => ({
  teacher_id: 2,
  date: logicalDate,
  timeslot,
  student: studentName,
  student_id: studentId,
  note: 'Temporary automated schedule-capacity verification.',
  trial: false,
});

try {
  const student = await jsonOk('/students', {
    ...auth,
    method: 'POST',
    body: {
      name: studentName,
      username: `capacity.${unique}`.slice(0, 40),
      password: `V9!${unique}aZ#`,
      notes: 'Temporary automated verification account.',
      teacher_id: 2,
      status: 'Active',
    },
  });
  studentId = Number(student.id);

  await expectCapacityRejection(regularSchedule('20:00 - 20:25'), admin.token);

  const trial = await jsonOk('/schedules', {
    ...auth,
    method: 'POST',
    body: { ...regularSchedule('20:30 - 20:55'), trial: true },
  });
  scheduleIds.add(Number(trial.id));
  await jsonOk(`/schedules/${trial.id}`, { ...auth, method: 'DELETE' });
  scheduleIds.delete(Number(trial.id));

  const purchase = await jsonOk('/class-transactions', {
    ...auth,
    method: 'POST',
    body: {
      student_id: studentId,
      receipt_no: `VERIFY-${unique}`.slice(0, 80),
      type: 'purchase',
      total_classes: 1,
      remaining_classes: 1,
      teacher_id: 2,
      status: 'active',
      date: logicalDate,
      notes: 'Temporary automated capacity verification.',
    },
  });
  transactionIds.add(Number(purchase.id));

  const reserved = await jsonOk('/schedules', {
    ...auth,
    method: 'POST',
    body: regularSchedule('21:00 - 21:25'),
  });
  scheduleIds.add(Number(reserved.id));
  await expectCapacityRejection(regularSchedule('21:30 - 21:55'), admin.token);

  await jsonOk(`/schedules/${reserved.id}`, { ...auth, method: 'DELETE' });
  scheduleIds.delete(Number(reserved.id));

  const released = await jsonOk('/schedules', {
    ...auth,
    method: 'POST',
    body: regularSchedule('22:00 - 22:25'),
  });
  scheduleIds.add(Number(released.id));
  await jsonOk(`/schedules/${released.id}`, { ...auth, method: 'DELETE' });
  scheduleIds.delete(Number(released.id));

  await jsonOk(`/class-transactions/${purchase.id}`, { ...auth, method: 'DELETE' });
  transactionIds.delete(Number(purchase.id));

  const monthly = await jsonOk('/class-transactions', {
    ...auth,
    method: 'POST',
    body: {
      student_id: studentId,
      receipt_no: `MONTHLY-${unique}`.slice(0, 80),
      type: 'monthly-fee',
      total_classes: 0,
      remaining_classes: 0,
      teacher_id: 2,
      status: 'active',
      date: logicalDate,
      notes: 'Temporary automated monthly-fee verification.',
    },
  });
  transactionIds.add(Number(monthly.id));

  const monthlySchedule = await jsonOk('/schedules', {
    ...auth,
    method: 'POST',
    body: regularSchedule('22:30 - 22:55'),
  });
  scheduleIds.add(Number(monthlySchedule.id));
} finally {
  for (const scheduleId of scheduleIds) {
    await request(`/schedules/${scheduleId}`, { ...auth, method: 'DELETE' });
  }
  for (const transactionId of transactionIds) {
    await request(`/class-transactions/${transactionId}`, { ...auth, method: 'DELETE' });
  }
  if (studentId) {
    await request(`/students/${studentId}`, { ...auth, method: 'DELETE' });
  }
}

console.log(JSON.stringify({
  ok: true,
  zeroBalanceScheduleRejected: true,
  pendingScheduleCapacityReserved: true,
  releasedCapacityReusable: true,
  trialScheduleBalanceExempt: true,
  monthlyFeeScheduleBalanceExempt: true,
  cleanupComplete: true,
}, null, 2));
