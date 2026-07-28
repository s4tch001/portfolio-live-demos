const TOKEN_KEY = 'rcmi-admin-token';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const API_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/rcmi-api` : '';
const RETRYABLE_ERRORS = new Set(['database_unavailable', 'temporary_unavailable']);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function hasAdminToken() {
  return Boolean(getAdminToken());
}

// Shared fetch helper for all Netlify function calls.
// Pass { auth: true } to attach the admin session token.
export async function api(path, options = {}) {
  if (!API_BASE || !SUPABASE_PUBLISHABLE_KEY) {
    const error = new Error('The portfolio demo backend is not configured.');
    error.status = 503;
    throw error;
  }
  const { auth, headers: extraHeaders, ...rest } = options;
  const method = String(rest.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' || method === 'HEAD' ? 3 : 1;
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...(extraHeaders || {}),
  };

  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/${path}`, { ...rest, headers });
      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        return payload;
      }

      const error = new Error(payload.error || 'Something went wrong. Please try again.');
      error.status = response.status;
      lastError = error;

      if (
        attempt < maxAttempts &&
        response.status === 503 &&
        RETRYABLE_ERRORS.has(String(payload.error || ''))
      ) {
        await wait(250 * attempt);
        continue;
      }

      throw error;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && method === 'GET') {
        await wait(250 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
