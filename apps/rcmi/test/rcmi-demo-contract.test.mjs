import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('seeds exactly eight visibly fictional directory entries', async () => {
  const migration = await read('supabase/migrations/20260722000300_rcmi_demo.sql');
  const names = migration.match(/'Preview (?:Leader|Member|Guest) [A-Z]'/g) ?? [];
  assert.equal(new Set(names).size, 8);
  assert.match(migration, /'pastor-sherwin'/);
  assert.match(migration, /'ate-anj'/);
  assert.match(migration, /p_logical_date - 1/);
  assert.match(migration, /p_logical_date - 2/);
});

test('restores the protected administrator password and leaves reset disabled', async () => {
  const migration = await read('supabase/migrations/20260722000300_rcmi_demo.sql');
  assert.match(migration, /'admin_password_hash'.+'password'/s);
  assert.match(migration, /protect_default_password/);
  assert.match(migration, /protected demo setting/);
  assert.match(migration, /set database_reset_ready = true/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});

test('shows the default password hint and removes password mutation controls', async () => {
  const admin = await read('apps/rcmi/src/AdminPage.jsx');
  assert.match(admin, /Portfolio preview password: <strong>password<\/strong>/);
  assert.match(admin, /cannot be changed/);
  assert.doesNotMatch(admin, /Change Password/);
  assert.doesNotMatch(admin, /newPassword/);
});

test('RCMI Edge API uses a named key, bounded mutations, and immutable password', async () => {
  const edge = await read('supabase/functions/rcmi-api/index.ts');
  assert.match(edge, /auth: "publishable:rcmi"/);
  assert.match(edge, /count > 200/);
  assert.match(edge, /login_temporarily_locked/);
  assert.match(edge, /demo_password_immutable/);
  assert.match(edge, /ids\.slice\(0, 100\)/);
  assert.match(edge, /ALLOWED_ORIGINS/);
});

test('frontend consumes only environment-provided public Supabase settings', async () => {
  const api = await read('apps/rcmi/src/lib/api.js');
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(api, /apikey: SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(api, /\.netlify\/functions/);
  assert.doesNotMatch(api, /ivqfxdibluhgyttgxbmz/);
});
