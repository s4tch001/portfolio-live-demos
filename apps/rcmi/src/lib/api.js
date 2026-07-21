const TOKEN_KEY = 'rcmi-admin-token';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const API_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/rcmi-api` : '';

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
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...(extraHeaders || {}),
  };

  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/${path}`, { ...rest, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }

  return payload;
}
