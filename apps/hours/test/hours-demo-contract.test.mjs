import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createHoursSampleEntries,
  manilaLogicalDate,
  monthKeyFromLogicalDate,
} from '../../../supabase/functions/_shared/manila-demo-dates.js';

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
  assert.match(edge, /auth: "publishable:hours_demo"/);
  assert.match(edge, /eq\("session_hash", sessionHash\)/);
  assert.match(edge, /value\.length > 48/);
  assert.match(edge, /daily_hours_exceeded/);
  assert.match(edge, /count > 200/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /https:\/\/pauuu-hours-demo\.netlify\.app/);
  assert.match(edge, /session_hash: tokenHash/);
  assert.match(edge, /createHoursSampleEntries\(currentLogicalDate\)/);
  assert.match(edge, /logicalDate: currentLogicalDate/);
  assert.match(edge, /delete\(\)\.eq\("token_hash", tokenHash\)/);
});

test('adds Hours samples only after each Manila workday is complete', () => {
  const julyStart = createHoursSampleEntries('2026-07-01');
  const julySecond = createHoursSampleEntries('2026-07-02');
  const julyEnd = createHoursSampleEntries('2026-07-31');
  const august = createHoursSampleEntries('2026-08-01');
  const augustSaturday = createHoursSampleEntries('2026-08-08');
  const augustSunday = createHoursSampleEntries('2026-08-09');
  const augustTuesday = createHoursSampleEntries('2026-08-11');

  assert.deepEqual(julyStart, []);
  assert.equal(julySecond.length, 1);
  assert.equal(julySecond[0].dateKey, '2026-07-01');
  assert.ok(julyEnd.length > julySecond.length && julyEnd.length <= 23);
  assert.deepEqual(august, []);
  assert.equal(augustSaturday.length, 5);
  assert.deepEqual(augustSaturday, augustSunday);
  assert.equal(augustTuesday.length, 6);
  assert.ok(julyEnd.every((entry) => entry.dateKey.startsWith('2026-07-')));
  assert.ok(august.every((entry) => entry.dateKey.startsWith('2026-08-')));
  assert.ok(julyEnd.every((entry) => (
    entry.hoursList.length >= 1
    && entry.hoursList.every((hours) => hours > 0 && hours <= 24)
    && entry.hoursList.reduce((sum, hours) => sum + hours, 0) <= 24
  )));
  assert.equal(monthKeyFromLogicalDate('2028-02-29'), '2028-02');
  assert.throws(() => monthKeyFromLogicalDate('2027-02-29'), TypeError);
});

test('allows an empty first-of-month Hours baseline without failing login', async () => {
  const edge = await read('supabase/functions/hours-api/index.ts');
  assert.match(edge, /if \(sampleRows\.length > 0\)/);
});

test('changes the logical month exactly at midnight in Asia/Manila', () => {
  assert.equal(manilaLogicalDate(new Date('2026-07-31T15:59:59.999Z')), '2026-07-31');
  assert.equal(manilaLogicalDate(new Date('2026-07-31T16:00:00.000Z')), '2026-08-01');
  assert.equal(manilaLogicalDate(new Date('2026-12-31T16:00:00.000Z')), '2027-01-01');
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

test('keeps gates and modal overlays inside the page area below the preview notice', async () => {
  const css = await read('apps/hours/assets/css/styles.css');
  for (const selector of ['overlay', 'pw-gate', 'chpw-overlay']) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?inset: var\\(--portfolio-demo-notice-height, 0px\\) 0 0`));
  }
});
