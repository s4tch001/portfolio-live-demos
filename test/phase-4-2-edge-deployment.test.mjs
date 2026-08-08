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

  assert.ok(['4.2', '4.3', '4.4', '4.5'].includes(state.phase));
  assert.deepEqual(state.supabase.dataApi.exposedSchemas, expected);
  assert.deepEqual(project.dashboardConfiguration.exposedSchemas, expected);
  assert.equal(state.supabase.dataApi.maxRows, 500);
  assert.equal(state.supabase.dataApi.browserRolesDirectAccessDenied, true);
  assert.doesNotMatch(JSON.stringify(expected), /demo_control|payroll_demo|travels_demo/);
});

test('each persistent app API accepts only its exact named publishable key', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const functions = {
    'cn-api': ['cn_demo', 17],
    'rcmi-api': ['rcmi_demo', 7],
    'hours-api': ['hours_demo', 8],
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
  assert.equal(verification.cn.zeroBalanceScheduleRejected, true);
  assert.equal(verification.cn.pendingScheduleCapacityReserved, true);
  assert.equal(verification.cn.releasedScheduleCapacityReusable, true);
  assert.equal(verification.cn.trialScheduleBalanceExempt, true);
  assert.equal(verification.cn.monthlyFeeScheduleBalanceExempt, true);
  assert.deepEqual(
    [verification.cn.teacherCount, verification.cn.studentCount, verification.cn.scheduleCount, verification.cn.reportCount],
    [4, 16, 336, 75],
  );
  assert.equal(verification.cn.credentialMutationRejected, true);
  assert.equal(verification.cn.restrictedRoutesRejected, true);
  assert.equal(verification.rcmi.memberCount, 16);
  assert.equal(verification.rcmi.administratorLoginVerified, true);
  assert.equal(verification.rcmi.passwordMutationRejected, true);
  assert.equal(verification.hours.passwordLoginVerified, true);
  assert.equal(verification.hours.entriesReadVerified, true);
  assert.equal(verification.hours.sampleEntryCount, 5);
  assert.equal(verification.hours.sampleMonth, '2026-08');
  assert.equal(verification.hours.passwordMutationRejected, true);
  assert.deepEqual(verification.monthlyDemoData, {
    verifiedAt: '2026-08-08',
    timezone: 'Asia/Manila',
    logicalDate: '2026-08-08',
    monthKey: '2026-08',
    cnSchedules: 336,
    cnReports: 75,
    cnAbsentReports: 5,
    cnTransactions: 20,
    rcmiMembers: 16,
    rcmiAttendanceDays: 2,
    hoursSessionEntries: 5,
  });
});

test('later hosting work remains gated after reset activation', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));
  const resetsActive = ['4.3', '4.4', '4.5'].includes(state.phase);

  for (const app of Object.values(state.supabase.applications)) {
    assert.equal(app.databaseResetReady, true);
    assert.equal(app.enabled, resetsActive);
  }
  assert.equal(state.supabase.liveVerification.resetCoordinatorClaimed, 0);
  assert.equal(state.supabase.cronInstalled, resetsActive);
  assert.equal(state.netlifySitesCreated, ['4.4', '4.5'].includes(state.phase));
  assert.equal(state.cloudflareSubdomainsConfigured, state.phase === '4.5');
  assert.equal(state.portfolioUpdated, true);
});
