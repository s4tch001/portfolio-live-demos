import OpenAI from 'openai';
import { AI_COMPOSE_SYSTEM_PROMPT, formatAiReport } from '../../../../supabase/functions/cn-api/ai-composer.ts';

// Fixed demo backend; client input must never select the upstream URL.
const CN_API = 'https://ivqfxdibluhgyttgxbmz.supabase.co/functions/v1/cn-api';
const MODEL = 'gpt-4o-mini';

function cnApiUrl() {
  const local = process.env.CN_DEMO_LOCAL_API_URL;
  if (!local) return CN_API;
  const url = new URL(local);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.pathname !== '/functions/v1/cn-api') {
    throw new Error('invalid_local_demo_api_url');
  }
  return url.toString().replace(/\/$/, '');
}

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

async function cnRequest(path, method, headers, body) {
  const response = await fetch(cnApiUrl() + path, {
    method,
    headers: {
      authorization: headers.authorization,
      apikey: headers.apikey,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => null);
  return { status: response.status, result };
}

export default async function handler(request) {
  const path = new URL(request.url).pathname;
  const usagePath = path.endsWith('/usage');
  if (usagePath ? request.method !== 'GET' : request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  const authorization = request.headers.get('authorization') || '';
  const apikey = request.headers.get('apikey') || '';
  if (!/^Bearer [A-Za-z0-9_-]{20,100}$/.test(authorization) || !apikey) {
    return json({ error: 'unauthorized' }, 401);
  }
  const headers = { authorization, apikey };
  const gatewayAvailable = !!(process.env.OPENAI_BASE_URL && process.env.OPENAI_API_KEY);

  if (usagePath) {
    try {
      const upstream = await cnRequest('/ai/compose-report/usage', 'GET', headers);
      if (upstream.status !== 200) return json({ error: upstream.result?.error || 'ai_unavailable' }, upstream.status);
      return json({ usage: upstream.result?.usage, available: gatewayAvailable });
    } catch (_) {
      return json({ error: 'ai_unavailable' }, 503);
    }
  }
  if (!gatewayAvailable) return json({ error: 'ai_not_configured' }, 503);
  if (Number(request.headers.get('content-length') || 0) > 24 * 1024) {
    return json({ error: 'request_too_large' }, 413);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Number.isSafeInteger(Number(body.schedule_id)) || Number(body.schedule_id) < 1
    || typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length > 4000
    || typeof body.class_duration !== 'string' || body.class_duration.length > 100) {
    return json({ error: 'invalid_ai_request' }, 400);
  }

  let prepared;
  try {
    prepared = await cnRequest('/ai/compose-report/prepare', 'POST', headers, {
      schedule_id: body.schedule_id,
      notes: body.notes,
      class_duration: body.class_duration,
    });
  } catch (_) {
    return json({ error: 'ai_unavailable' }, 503);
  }
  if (prepared.status !== 200) {
    return json({ error: prepared.result?.error || 'ai_unavailable' }, prepared.status);
  }
  const data = prepared.result;
  if (!data?.context || !data?.notes) {
    return json({ error: 'ai_unavailable' }, 503);
  }

  try {
    // Netlify injects OPENAI_BASE_URL and OPENAI_API_KEY for AI Gateway at runtime.
    const client = new OpenAI({ timeout: 25000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: AI_COMPOSE_SYSTEM_PROMPT },
        { role: 'user', content: `One student: {{STUDENT_NAME}}\nTeacher's feedback notes:\n${data.notes}` },
      ],
      max_completion_tokens: 700,
      temperature: 0.25,
    });
    const report = formatAiReport(completion.choices?.[0]?.message?.content, data.context);
    if (!report) throw new Error('ai_empty_response');
    return json({ report, usage: data.usage, available: true });
  } catch (error) {
    return json({ error: error?.status === 429 ? 'ai_provider_busy' : 'ai_unavailable', usage: data.usage }, 502);
  }
}

export const config = {
  path: ['/api/ai/compose-report', '/api/ai/compose-report/usage'],
};
