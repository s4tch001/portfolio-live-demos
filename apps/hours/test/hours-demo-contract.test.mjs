import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('removes the original endpoint and consumes only public environment settings', async () => {
  const script = await read('apps/hours/assets/js/script.js');
  assert.match(script, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(script, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(script, /\/functions\/v1\/hours-api/);
  assert.doesNotMatch(script, /snmkclzdjnsrqmacpwze/);
  assert.doesNotMatch(script, /\/rest\/v1\/(?:hours|settings)/);
  assert.doesNotMatch(script, /eyJhbGciOi/);
});

test('shows the immutable default password and has no password-change controls', async () => {
  const html = await read('apps/hours/index.html');
  assert.match(html, /Portfolio preview password: <strong>password<\/strong>/);
  assert.match(html, /default password cannot be changed/);
  assert.doesNotMatch(html, /Change Password/);
  assert.doesNotMatch(html, /chpw/i);
});

test('isolates visitor entries by server-issued session and bounds stored hours', async () => {
  const edge = await read('supabase/functions/hours-api/index.ts');
  assert.match(edge, /auth: "publishable:hours"/);
  assert.match(edge, /eq\("session_hash", sessionHash\)/);
  assert.match(edge, /value\.length > 48/);
  assert.match(edge, /daily_hours_exceeded/);
  assert.match(edge, /count > 200/);
  assert.match(edge, /ALLOWED_ORIGINS/);
});

test('locks the password at the database and API layers', async () => {
  const [migration, edge] = await Promise.all([
    read('supabase/migrations/20260722000400_hours_demo.sql'),
    read('supabase/functions/hours-api/index.ts'),
  ]);
  assert.match(migration, /protect_default_password/);
  assert.match(migration, /'password_hash'.+'password'/s);
  assert.match(migration, /protected demo setting/);
  assert.match(edge, /demo_password_immutable/);
});

test('daily reset clears visitor sessions and leaves activation disabled', async () => {
  const migration = await read('supabase/migrations/20260722000400_hours_demo.sql');
  assert.match(migration, /delete from hours_demo\.sessions/);
  assert.match(migration, /set database_reset_ready = true/);
  assert.match(migration, /revoke all on function hours_demo\.reset_demo_data\(date\) from service_role/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});
