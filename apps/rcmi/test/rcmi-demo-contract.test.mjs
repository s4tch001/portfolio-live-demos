import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('seeds realistic current-month RCMI preview directory and attendance data', async () => {
  const migration = await read('supabase/migrations/20260726000100_enrich_cn_rcmi_preview_data.sql');
  for (const name of [
    'Sherwin Alonzo',
    'Anj Villanueva',
    'Clarissa Dela Cruz',
    'Paolo Mendoza',
    'Andrea Santos',
    'Rafael Torres',
  ]) {
    assert.match(migration, new RegExp(name));
  }
  assert.match(migration, /'pastor-sherwin'/);
  assert.match(migration, /'ate-anj'/);
  assert.match(migration, /month_start date := date_trunc\('month', p_logical_date\)::date/);
  assert.match(migration, /month_start \+ 23/);
  assert.match(migration, /rcmi_demo\.attendance/);
});

test('restores the protected administrator password and leaves reset disabled', async () => {
  const migration = [
    await read('supabase/migrations/20260722000300_rcmi_demo.sql'),
    await read('supabase/migrations/20260726000100_enrich_cn_rcmi_preview_data.sql'),
  ].join('\n');
  assert.match(migration, /'admin_password_hash'.+'password'/s);
  assert.match(migration, /protect_default_password/);
  assert.match(migration, /protected demo setting/);
  assert.match(migration, /set database_reset_ready = true/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});

test('RCMI demo root tells crawlers not to index or crawl the disposable preview', async () => {
  const index = await read('apps/rcmi/index.html');
  const robots = await read('apps/rcmi/public/robots.txt');
  const netlify = await read('apps/rcmi/netlify.toml');
  assert.match(index, /noindex, nofollow, noarchive, nosnippet, noimageindex/);
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \//);
  assert.match(netlify, /X-Robots-Tag = "noindex, nofollow, noarchive, nosnippet, noimageindex"/);
});

test('shows the default password hint and removes password mutation controls', async () => {
  const admin = await read('apps/rcmi/src/AdminPage.jsx');
  assert.match(admin, /Portfolio preview password: <strong>password<\/strong>/);
  assert.match(admin, /cannot be changed/);
  assert.doesNotMatch(admin, /Change Password/);
  assert.doesNotMatch(admin, /newPassword/);
});

test('tells visitors to open the unlinked administrator route manually', async () => {
  const contracts = await read('packages/demo-shell/src/contracts.js');
  const notice = await read('packages/demo-shell/src/demo-notice.js');
  assert.match(contracts, /manually open \/administrator in the address bar/);
  assert.match(notice, /model\.navigationHint/);
});

test('RCMI Edge API uses a named key, bounded mutations, and immutable password', async () => {
  const edge = await read('supabase/functions/rcmi-api/index.ts');
  assert.match(edge, /auth: "publishable:rcmi_demo"/);
  assert.match(edge, /count > 200/);
  assert.match(edge, /login_temporarily_locked/);
  assert.match(edge, /demo_password_immutable/);
  assert.match(edge, /ids\.slice\(0, 100\)/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /https:\/\/pauuu-rcmi-demo\.netlify\.app/);
});

test('frontend consumes only environment-provided public Supabase settings', async () => {
  const api = await read('apps/rcmi/src/lib/api.js');
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(api, /apikey: SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(api, /\.netlify\/functions/);
  assert.doesNotMatch(api, /ivqfxdibluhgyttgxbmz/);
});

test('exports attendance as dependency-light CSV instead of the vulnerable ExcelJS chain', async () => {
  const app = await read('apps/rcmi/src/App.jsx');
  const pkg = JSON.parse(await read('apps/rcmi/package.json'));
  assert.doesNotMatch(app, /import\('exceljs'\)|ExcelJS|writeBuffer/);
  assert.match(app, /downloadCsv\(`\$\{baseName\}-per-day\.csv`/);
  assert.match(app, /downloadCsv\(`\$\{baseName\}-monthly-summary\.csv`/);
  assert.equal(pkg.dependencies.exceljs, undefined);
});

test('keeps full-screen overlays below the preview notice', async () => {
  const css = await read('apps/rcmi/src/styles.css');
  assert.match(css, /\.modalOverlay\s*\{[\s\S]*?inset: var\(--portfolio-demo-notice-height, 0px\) 0 0/);
  assert.match(css, /\.overlay\s*\{[\s\S]*?inset: var\(--portfolio-demo-notice-height, 0px\) 0 0/);
});
