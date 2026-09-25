import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../netlify/functions/ai-compose-report.mjs';

const AUTH = `Bearer ${'a'.repeat(43)}`;
const HEADERS = { authorization: AUTH, apikey: 'public-demo-key', 'content-type': 'application/json' };
const URL = 'https://cn-demo.pauuu.dev/api/ai/compose-report';

function post() {
  return new Request(URL, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ schedule_id: 42, notes: 'Alex participated.', class_duration: '25 mins' }),
  });
}

test('Netlify Function checks schedule ownership before calling AI Gateway', async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.OPENAI_BASE_URL;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = 'https://gateway.example/v1';
  process.env.OPENAI_API_KEY = 'test-gateway-key';
  let gatewayCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/ai/compose-report/prepare')) return Response.json({ error: 'forbidden' }, { status: 403 });
    gatewayCalls += 1;
    return Response.json({ error: 'unexpected' }, { status: 500 });
  };
  try {
    const response = await handler(post());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'forbidden');
    assert.equal(gatewayCalls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test('Netlify Function sends tokenized notes to Gateway and returns a formatted report', async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.OPENAI_BASE_URL;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = 'https://gateway.example/v1';
  process.env.OPENAI_API_KEY = 'test-gateway-key';
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes('/ai/compose-report/prepare')) {
      assert.equal(options.headers.authorization, AUTH);
      return Response.json({
        notes: '{{STUDENT_NAME}} participated.',
        context: { student: 'Alex', teacherName: 'Ms Lee', date: '2026-09-25', timeslot: '17:00-17:25', duration: '25 mins' },
        usage: { remaining: 9, limit: 10 },
      });
    }
    providerRequest = JSON.parse(options.body);
    return Response.json({
      id: 'chatcmpl_demo', object: 'chat.completion', created: 0, model: 'gpt-4o-mini',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Feedback: {{STUDENT_NAME}} participated well.' } }],
    });
  };
  try {
    const response = await handler(post());
    assert.equal(response.status, 200);
    assert.equal(providerRequest.model, 'gpt-4o-mini');
    assert.match(providerRequest.messages[1].content, /\{\{STUDENT_NAME\}\}/);
    assert.doesNotMatch(providerRequest.messages[1].content, /Alex/);
    const result = await response.json();
    assert.match(result.report, /Student Name: Alex/);
    assert.match(result.report, /Alex participated well/);
    assert.equal(result.usage.remaining, 9);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});
