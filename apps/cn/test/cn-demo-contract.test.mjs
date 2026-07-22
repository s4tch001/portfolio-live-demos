import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(appRoot, '..', '..');

async function read(relativePath) {
  return readFile(path.join(workspaceRoot, relativePath), 'utf8');
}

test('shows only the three approved immutable preview credentials', async () => {
  const login = await read('apps/cn/src/pages/LoginPage/LoginPage.jsx');
  assert.match(login, /admin<\/code> \/ <code>password/);
  assert.match(login, /testteacher<\/code> \/ <code>password/);
  assert.match(login, /teststudent<\/code> \/ <code>password/);
  assert.doesNotMatch(login, /devpau<\/code>/i);
  assert.match(login, /cannot be changed/i);
});

test('keeps restricted CN navigation behind non-preview master checks', async () => {
  const navigation = await read('apps/cn/src/components/Layout/navConfig.js');
  const remaining = await read('apps/cn/src/pages/RemainingClassesPage/remainingConstants.js');
  const permissions = await read('apps/cn/src/context/AuthContext.jsx');
  assert.match(navigation, /security[^\n]+master: true/);
  assert.match(remaining, /permissions[^\n]+view_permissions/);
  assert.match(remaining, /devtools[^\n]+master: true/);
  assert.match(permissions, /username[^\n]+devpau/);
});

test('database protects demo credentials and rejects the reserved master username', async () => {
  const migration = await read('supabase/migrations/20260722000200_cn_demo.sql');
  assert.match(migration, /lower\(coalesce\(new\.username, ''\)\) = 'devpau'/);
  assert.match(migration, /old\.protected/);
  assert.match(migration, /protected demo credential/);
  assert.match(migration, /'admin'.+'password'/s);
  assert.match(migration, /'testteacher'.+'password'/s);
  assert.match(migration, /'teststudent'.+'password'/s);
  assert.match(migration, /delete from cn_demo\.sessions/);
  assert.match(migration, /where app_id = 'cn'/);
  assert.match(migration, /set database_reset_ready = true/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});

test('CN Edge adapter is origin-bound, rate-limited, and denies master APIs', async () => {
  const edge = await read('supabase/functions/cn-api/index.ts');
  assert.match(edge, /auth: "publishable:cn_demo"/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /https:\/\/pauuu-cn-demo\.netlify\.app/);
  assert.match(edge, /login_temporarily_locked/);
  assert.match(edge, /path\.startsWith\("\/dev\/"\)/);
  assert.match(edge, /path\.startsWith\("\/admin-permissions"\)/);
  assert.match(edge, /demo_credentials_immutable/);
  assert.match(edge, /MAX_UPLOAD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(edge, /existing\.length >= 20/);
  assert.match(edge, /100 \* 1024 \* 1024/);
  assert.doesNotMatch(edge, /select\("id,username,password_hash,fullname,name,status,language"\)/);
  assert.match(edge, /candidate === "student"[\s\S]*password_hash,name,status,language[\s\S]*password_hash,fullname,status,language/);
  assert.match(edge, /role === "student"[\s\S]*id,username,name,status,language[\s\S]*id,username,fullname,status,language/);
});

test('CN frontend uses only environment-provided public Supabase configuration', async () => {
  const endpoint = await read('apps/cn/src/lib/workerUrl.js');
  const api = await read('apps/cn/src/lib/apiClient.js');
  assert.match(endpoint, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(endpoint, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(endpoint, /ivqfxdibluhgyttgxbmz/);
  assert.match(api, /apikey: SUPABASE_PUBLISHABLE_KEY/);
});

test('keeps sticky navigation and full-screen layers below the preview notice', async () => {
  const [app, css] = await Promise.all([
    read('apps/cn/src/App.jsx'),
    read('apps/cn/src/styles/styles.css'),
  ]);
  assert.match(app, /inset: 'var\(--portfolio-demo-notice-height, 0px\) 0 0'/);
  assert.match(css, /\.public-header\s*\{[\s\S]*?top: var\(--portfolio-demo-notice-height, 0px\)/);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?top: var\(--portfolio-demo-notice-height, 0px\)/);
  for (const selector of ['modal-overlay', 'link-modal', 'lightbox', 'maintenance-screen', 'hamburger-menu']) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?inset: var\\(--portfolio-demo-notice-height, 0px\\) 0 0`));
  }
});
