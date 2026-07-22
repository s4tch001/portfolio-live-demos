const SUPABASE_URL = 'https://ivqfxdibluhgyttgxbmz.supabase.co';
const timeout = () => AbortSignal.timeout(20_000);

const hostMode = process.env.DEMO_HOST_MODE === 'netlify' ? 'netlify' : 'custom';
const sites = Object.fromEntries(
  ['cn', 'rcmi', 'hours', 'payroll', 'travels'].map((app) => [
    app,
    hostMode === 'custom'
      ? `https://${app}-demo.pauuu.dev`
      : `https://pauuu-${app}-demo.netlify.app`,
  ]),
);

const publicKeys = {
  cn: process.env.CN_DEMO_PUBLISHABLE_KEY,
  rcmi: process.env.RCMI_DEMO_PUBLISHABLE_KEY,
  hours: process.env.HOURS_DEMO_PUBLISHABLE_KEY,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseJson(response, label) {
  const value = await response.json().catch(() => null);
  assert(response.ok, `${label} returned ${response.status}`);
  assert(value && typeof value === 'object', `${label} did not return JSON`);
  return value;
}

async function verifySite(name, baseUrl) {
  const response = await fetch(`${baseUrl}/`, { redirect: 'manual', signal: timeout() });
  const html = await response.text();
  const csp = response.headers.get('content-security-policy') ?? '';

  assert(response.status === 200, `${name} root returned ${response.status}`);
  assert((response.headers.get('content-type') ?? '').includes('text/html'), `${name} root is not HTML`);
  assert(csp.includes("default-src 'self'"), `${name} CSP is missing default-src`);
  assert(csp.includes("frame-ancestors 'none'"), `${name} CSP is missing frame-ancestors`);
  assert(csp.includes("object-src 'none'"), `${name} CSP is missing object-src`);
  assert(response.headers.get('x-frame-options') === 'DENY', `${name} X-Frame-Options is not DENY`);
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${name} nosniff is missing`);
  assert((response.headers.get('strict-transport-security') ?? '').includes('max-age=31536000'), `${name} HSTS is missing`);
  assert((response.headers.get('x-robots-tag') ?? '').includes('noindex'), `${name} noindex header is missing`);

  const assetPath = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  assert(assetPath, `${name} root has no hashed asset`);
  const asset = await fetch(`${baseUrl}${assetPath}`, { signal: timeout() });
  assert(asset.status === 200, `${name} asset returned ${asset.status}`);
  assert((asset.headers.get('cache-control') ?? '').includes('immutable'), `${name} asset cache is not immutable`);

  return { status: response.status, securityHeaders: true, immutableAsset: true };
}

async function verifySpa(name, path) {
  const [root, route] = await Promise.all([
    fetch(`${sites[name]}/`, { signal: timeout() }).then((response) => response.text()),
    fetch(`${sites[name]}${path}`, { signal: timeout() }).then(async (response) => {
      assert(response.status === 200, `${name}${path} returned ${response.status}`);
      return response.text();
    }),
  ]);
  assert(root === route, `${name}${path} did not resolve through the SPA fallback`);
}

async function apiRequest(app, path, init = {}) {
  const key = publicKeys[app];
  assert(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? ''), `${app} public key is unavailable`);
  return fetch(`${SUPABASE_URL}/functions/v1/${app}-api${path}`, {
    ...init,
    headers: {
      apikey: key,
      origin: sites[app],
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: timeout(),
  });
}

async function verifyApis() {
  const cn = await responseJson(await apiRequest('cn', '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'password' }),
  }), 'CN login');
  assert(cn.user?.username === 'admin' && typeof cn.token === 'string', 'CN default admin login failed');

  const rcmi = await responseJson(await apiRequest('rcmi', '/members'), 'RCMI members');
  assert(Array.isArray(rcmi.members) && rcmi.members.length >= 8, 'RCMI preview seed data is unavailable');

  const hours = await responseJson(await apiRequest('hours', '/session', {
    method: 'POST',
    body: JSON.stringify({ password: 'password' }),
  }), 'Hours login');
  assert(typeof hours.token === 'string', 'Hours default password login failed');

  return { cnDefaultAdmin: true, rcmiSeedData: true, hoursDefaultPassword: true };
}

try {
  const siteResults = {};
  for (const [name, url] of Object.entries(sites)) siteResults[name] = await verifySite(name, url);
  await verifySpa('cn', '/login');
  await verifySpa('rcmi', '/administrator');
  const apiResults = await verifyApis();
  console.log(JSON.stringify({ ok: true, hostMode, sites: siteResults, spaRoutes: true, apis: apiResults }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
}
