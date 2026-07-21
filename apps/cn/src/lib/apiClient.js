import { SUPABASE_PUBLISHABLE_KEY, WORKER_URL } from './workerUrl.js';

// The current bearer token lives here at module scope (mirrors the legacy
// global `currentSessionToken`). AuthContext keeps it in sync on login,
// session restore, and logout so every apiFetch picks it up automatically.
let authToken = '';
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token || '';
}
export function getAuthToken() {
  return authToken;
}

// Registered by AuthContext: invoked when an authenticated request gets a 401
// so the app can force a logout + redirect to login. Login itself opts out
// (its own 401 = bad credentials, handled locally) via the `skipAuthHandler`.
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// JSON API helper — identical contract to legacy apiFetch (app.js:642-666):
// sets Content-Type + Bearer, parses JSON, throws Error with .status/.data.
export async function apiFetch(path, method = 'GET', body = null, opts = {}) {
  if (!WORKER_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const error = new Error('The portfolio demo backend is not configured.');
    error.status = 503;
    throw error;
  }
  const fetchOpts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  };
  if (authToken) fetchOpts.headers.Authorization = `Bearer ${authToken}`;
  if (body) fetchOpts.body = JSON.stringify(body);

  const res = await fetch(WORKER_URL + path, fetchOpts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {}

  if (!res.ok) {
    if (res.status === 401 && !opts.skipAuthHandler && onUnauthorized) {
      onUnauthorized();
    }
    const error = new Error((data && data.error) || text || res.statusText);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

// Multipart upload for report images — separate from apiFetch because the
// browser must set the multipart boundary itself (no JSON Content-Type).
// Mirrors legacy uploadImageToR2 (app.js:936-966); WebP conversion is done
// by the caller (see lib/format imageToWebP) before calling this.
export async function uploadFile(file) {
  if (!WORKER_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('The portfolio demo backend is not configured.');
  }
  const formData = new FormData();
  formData.append('file', file);
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(WORKER_URL + '/upload', {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    let msg = 'Upload failed';
    try {
      const e = await res.json();
      if (e && e.error) msg = e.error;
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.url;
}

// Build a path with query string, skipping empty values (legacy queryPath).
export function queryPath(path, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
