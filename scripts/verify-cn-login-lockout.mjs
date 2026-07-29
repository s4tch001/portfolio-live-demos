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

function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: { username, password, remember_me: false },
  });
}

for (const username of ['admin', 'testteacher', 'teststudent']) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await login(username, `wrong-preview-password-${attempt}`);
    assert.equal(response.status, 401, `${username} must remain exempt from login blocking`);
  }
  assert.equal((await login(username, 'password')).status, 200, `${username} was blocked despite its exemption`);
}

const adminResponse = await login('admin', 'password');
assert.equal(adminResponse.status, 200, 'administrator login failed');
const admin = await adminResponse.json();
const sampleUsername = 'amanda.reyes';
const samplePassword = 'T8v!kP2q#rL9mX4z';
let restored = false;

try {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await login(sampleUsername, `wrong-sample-password-${attempt}`);
    assert.equal(response.status, 401, `failed login ${attempt} should stay enumeration-safe`);
  }

  const blockedResponse = await request('/teachers/2', { token: admin.token });
  assert.equal(blockedResponse.status, 200, 'could not inspect the sample teacher');
  const blocked = await blockedResponse.json();
  assert.equal(blocked.status, 'Login Blocked', 'the fifth failed login did not block the account');

  const correctWhileBlocked = await login(sampleUsername, samplePassword);
  assert.equal(correctWhileBlocked.status, 403, 'blocked account accepted correct credentials');
  assert.equal((await correctWhileBlocked.json()).error, 'account_blocked');
} finally {
  const restoreResponse = await request('/teachers/2', {
    method: 'PUT',
    token: admin.token,
    body: { status: 'Active' },
  });
  assert.equal(restoreResponse.status, 200, 'failed to restore the sample teacher after verification');
  restored = true;
}

assert.equal(restored, true);
assert.equal((await login(sampleUsername, samplePassword)).status, 200, 'unblocked account could not log in');

console.log(JSON.stringify({
  ok: true,
  maxFailedLogins: 5,
  exemptUsernames: ['admin', 'testteacher', 'teststudent'],
  sampleAccountBlockedOnFifthFailure: true,
  blockedReasonProtectedByPasswordCheck: true,
  sampleAccountRestored: true,
}, null, 2));
