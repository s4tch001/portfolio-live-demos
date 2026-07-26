import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const appIds = ['cn', 'rcmi', 'hours', 'payroll', 'travels'];

test('deployment record matches all committed migration versions', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const files = await readdir(path.join(root, 'supabase', 'migrations'));
  const versions = files
    .filter((filename) => /^\d{14}_.+\.sql$/.test(filename))
    .map((filename) => filename.slice(0, 14))
    .sort();
  assert.deepEqual(state.supabase.migrationVersions, versions);
  assert.equal(state.supabase.remoteMigrationHistoryVerified, true);
  assert.equal(state.supabase.remoteLintErrorCount, 0);
});

test('every schema remains ready and reset activation follows the recorded phase', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const resetsActive = ['4.3', '4.4', '4.5'].includes(state.phase);
  for (const appId of appIds) {
    assert.deepEqual(state.supabase.applications[appId], {
      databaseResetReady: true,
      enabled: resetsActive,
    });
  }
  assert.equal(state.supabase.cronInstalled, resetsActive);
});

test('Phase 4.1 hosting safety boundaries remain after later Supabase deployment', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  assert.equal(state.netlifySitesCreated, ['4.4', '4.5'].includes(state.phase));
  assert.equal(state.cloudflareSubdomainsConfigured, state.phase === '4.5');
  assert.equal(state.portfolioUpdated, true);
});

test('no app migration can enable a reset registration', async () => {
  const files = await readdir(path.join(root, 'supabase', 'migrations'));
  for (const filename of files.filter((entry) => /^20260722000[2-6].+\.sql$/.test(entry))) {
    const migration = await read(`supabase/migrations/${filename}`);
    assert.match(migration, /database_reset_ready = true/);
    assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
  }
});
