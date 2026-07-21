import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('defers dependent hours synchronization until total hours loses focus', async () => {
  const script = await read('apps/payroll/assets/js/script.js');
  const inputHandler = script.match(/\$totalHours\.addEventListener\('input',[\s\S]*?\n\}\);/)?.[0] ?? '';
  const blurHandler = script.match(/\$totalHours\.addEventListener\('blur',[\s\S]*?\n\}\);/)?.[0] ?? '';
  assert.doesNotMatch(inputHandler, /syncHours\(\)/);
  assert.match(blurHandler, /syncHours\(\)/);
});

test('defers dependent hours synchronization until a person field loses focus', async () => {
  const script = await read('apps/payroll/assets/js/script.js');
  const inputHandler = script.match(/hoursEl\.addEventListener\('input',[\s\S]*?\n    \}\);/)?.[0] ?? '';
  const blurHandler = script.match(/hoursEl\.addEventListener\('blur',[\s\S]*?\n    \}\);/)?.[0] ?? '';
  assert.doesNotMatch(inputHandler, /syncHours\(\)/);
  assert.match(blurHandler, /syncHours\(\)/);
});

test('does not derive a negative missing-hours value', async () => {
  const script = await read('apps/payroll/assets/js/script.js');
  assert.match(script, /const remaining = total - sumKnown/);
  assert.match(script, /if \(remaining >= 0\)/);
  assert.match(script, /\$hoursWarn\.classList\.add\('show'\)/);
});

test('uses module-bound event listeners and escapes editable names', async () => {
  const [html, script] = await Promise.all([
    read('apps/payroll/index.html'),
    read('apps/payroll/assets/js/script.js'),
  ]);
  assert.doesNotMatch(html, /\sonclick=/i);
  assert.match(html, /type="module"/);
  assert.match(script, /escHtml\(name\)/);
  assert.match(script, /escHtml\(emp\.name\)/);
});

test('stores no visitor values and keeps the reset handler disabled', async () => {
  const migration = await read('supabase/migrations/20260722000500_payroll_demo.sql');
  assert.doesNotMatch(migration, /create table/i);
  assert.match(migration, /persists no visitor data/);
  assert.match(migration, /database_reset_ready = true/);
  assert.match(migration, /service_role/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});
