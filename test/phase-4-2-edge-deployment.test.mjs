import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('Phase 4.2 records only the reviewed Data API schemas', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const project = JSON.parse(await read('config/supabase-project.json'));
  const expected = ['public', 'graphql_public', 'cn_demo', 'rcmi_demo', 'hours_demo'];

  assert.equal(state.phase, '4.2');
  assert.deepEqual(state.supabase.dataApi.exposedSchemas, expected);
  assert.deepEqual(project.dashboardConfiguration.exposedSchemas, expected);
  assert.equal(state.supabase.dataApi.maxRows, 500);
  assert.equal(state.supabase.dataApi.browserRolesDirectAccessDenied, true);
  assert.doesNotMatch(JSON.stringify(expected), /demo_control|payroll_demo|travels_demo/);
});

test('each persistent app API accepts only its exact named publishable key', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const functions = {
    'cn-api': ['cn_demo', 6],
    'rcmi-api': ['rcmi_demo', 5],
    'hours-api': ['hours_demo', 5],
  };

  for (const [functionName, [keyName, version]] of Object.entries(functions)) {
    const source = await read(`supabase/functions/${functionName}/index.ts`);
    assert.match(source, new RegExp(`auth: "publishable:${keyName}"`));
    assert.equal(state.supabase.namedKeys[keyName], 'configured');
    assert.deepEqual(state.supabase.edgeFunctions[functionName], {
      status: 'active',
      version,
      verifyJwt: false,
    });
  }
});

test('live checks cover key isolation, sample baselines, and immutable credentials', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const verification = state.supabase.liveVerification;

  assert.equal(verification.completed, true);
  assert.equal(verification.corsPreflight, true);
  assert.equal(verification.blockedOriginRejected, true);
  assert.equal(verification.missingKeyRejected, true);
  assert.equal(verification.crossKeyRejected, true);
  assert.deepEqual(verification.cn.defaultLoginsVerified, ['admin', 'testteacher', 'teststudent']);
  assert.deepEqual(
    [verification.cn.teacherCount, verification.cn.studentCount, verification.cn.scheduleCount, verification.cn.reportCount],
    [3, 6, 7, 2],
  );
  assert.equal(verification.cn.credentialMutationRejected, true);
  assert.equal(verification.cn.restrictedRoutesRejected, true);
  assert.equal(verification.rcmi.memberCount, 8);
  assert.equal(verification.rcmi.administratorLoginVerified, true);
  assert.equal(verification.rcmi.passwordMutationRejected, true);
  assert.equal(verification.hours.passwordLoginVerified, true);
  assert.equal(verification.hours.entriesReadVerified, true);
  assert.equal(verification.hours.passwordMutationRejected, true);
});

test('reset activation and later hosting work remain gated', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));

  for (const app of Object.values(state.supabase.applications)) {
    assert.equal(app.databaseResetReady, true);
    assert.equal(app.enabled, false);
  }
  assert.equal(state.supabase.liveVerification.resetCoordinatorClaimed, 0);
  assert.equal(state.supabase.cronInstalled, false);
  assert.equal(state.netlifySitesCreated, false);
  assert.equal(state.cloudflareSubdomainsConfigured, false);
  assert.equal(state.portfolioUpdated, false);
});
