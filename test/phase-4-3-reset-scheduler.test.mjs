import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('scheduler migration keeps credentials in Vault and its cron command secret-free', async () => {
  const migration = await read('supabase/migrations/20260722000700_activate_daily_resets.sql');

  assert.match(migration, /from vault\.decrypted_secrets/i);
  assert.match(migration, /portfolio_demo_project_url/);
  assert.match(migration, /portfolio_demo_automations_key/);
  assert.match(migration, /'apikey', automation_key/);
  assert.match(migration, /'select demo_control\.dispatch_reset_coordinator\(\);'/);
  assert.doesNotMatch(migration, /sb_secret_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(migration, /authorization['"\s,:]+bearer/i);
});

test('scheduler is bounded, fail-closed, and private', async () => {
  const migration = await read('supabase/migrations/20260722000700_activate_daily_resets.sql');

  assert.match(migration, /create extension if not exists pg_net with schema extensions/i);
  assert.match(migration, /create extension if not exists pg_cron/i);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /timeout_milliseconds := 10000/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function demo_control\.dispatch_reset_coordinator\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /app_count <> 5 or ready_count <> 5/);
  assert.match(migration, /matching_jobs <> 1/);
});

test('status RPC reveals operational state but not commands or Vault values', async () => {
  const activation = await read('supabase/migrations/20260722000700_activate_daily_resets.sql');
  const verification = await read('supabase/migrations/20260722000800_verify_persistent_reset_handlers.sql');
  const statusFunction = verification.match(
    /create or replace function public\.get_demo_reset_status\(\)[\s\S]*?comment on function public\.get_demo_reset_status\(\)/i,
  )?.[0] ?? '';

  assert.match(statusFunction, /'timezone', 'Asia\/Manila'/);
  assert.match(statusFunction, /'jobName'/);
  assert.match(statusFunction, /'schedule'/);
  assert.match(statusFunction, /'active'/);
  assert.match(statusFunction, /'latestErrorCategory'/);
  assert.doesNotMatch(statusFunction, /decrypted_secrets|automation_key|job\.command/i);
  assert.match(verification, /grant execute on function public\.get_demo_reset_status\(\) to service_role/i);
  assert.match(
    verification,
    /revoke all on function public\.get_demo_reset_status\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(activation + verification, /sb_secret_[A-Za-z0-9_-]{20,}/);
});

test('persistent reset handlers are self-tested before failed runs are released', async () => {
  const migration = await read('supabase/migrations/20260722000800_verify_persistent_reset_handlers.sql');

  for (const schema of ['cn_demo', 'rcmi_demo', 'hours_demo']) {
    assert.match(migration, new RegExp(`perform ${schema}\\.reset_demo_data\\(logical_date\\)`));
  }
  assert.match(migration, /exception when others then[\s\S]*raise exception using/i);
  assert.match(migration, /where reset_run\.logical_date = \(clock_timestamp\(\) at time zone 'Asia\/Manila'\)::date/i);
  assert.match(migration, /and reset_run\.state = 'failed'/i);
});

test('the exact reset RPC wrapper is transactionally self-tested', async () => {
  const migration = await read('supabase/migrations/20260722000900_verify_reset_orchestration.sql');

  assert.match(migration, /for update/i);
  assert.match(migration, /from public\.execute_demo_database_reset\(current_run\.id, test_worker_id\)/i);
  assert.match(migration, /perform public\.mark_demo_storage_pending\(current_run\.id, test_worker_id\)/i);
  assert.match(migration, /exception when others then[\s\S]*reset orchestration self-test failed/i);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/i);
});

test('persistent reset deletes satisfy the hosted Data API safety guard', async () => {
  const migration = await read('supabase/migrations/20260722001000_make_reset_deletes_data_api_safe.sql');

  assert.match(migration, /pg_get_functiondef\(to_regprocedure\(target\.signature\)\)/i);
  assert.match(migration, /replace\(delete_statement, ';', ' where true;'\)/i);
  assert.match(migration, /reviewed reset function no longer matches its safe-delete migration/i);
  assert.match(migration, /reset handler still contains an unconditional DELETE without WHERE/i);

  for (const table of [
    'cn_demo.sessions',
    'cn_demo.uploads',
    'cn_demo.activity_logs',
    'rcmi_demo.members',
    'rcmi_demo.attendance',
    'hours_demo.sessions',
  ]) {
    assert.match(migration, new RegExp(`delete from ${table.replace('.', '\\.')}\\s*;`, 'i'));
  }
});

test('private status reports bounded Cron execution evidence', async () => {
  const migration = await read('supabase/migrations/20260722001100_add_private_cron_run_status.sql');

  assert.match(migration, /from cron\.job_run_details as run/i);
  assert.match(migration, /'latestRunStatus'/);
  assert.match(migration, /'latestRunStartedAt'/);
  assert.match(migration, /'latestRunEndedAt'/);
  assert.doesNotMatch(migration, /return_message|job\.command|decrypted_secrets/i);
  assert.match(migration, /grant execute on function public\.get_demo_reset_status\(\) to service_role/i);
});

test('deployment record captures successful reset, Cron, and post-reset baselines', async () => {
  const state = JSON.parse(await read('config/deployment-state.json'));

  assert.ok(['4.3', '4.4'].includes(state.phase));
  assert.equal(state.supabase.cronInstalled, true);
  assert.deepEqual(state.supabase.resetScheduler, {
    installed: true,
    jobName: 'portfolio-demo-reset-dispatch',
    schedule: '*/15 * * * *',
    timezone: 'Asia/Manila',
    latestRunStatus: 'succeeded',
    latestRunStartedAt: '2026-07-22T02:30:00.153704+00:00',
    latestRunEndedAt: '2026-07-22T02:30:00.179159+00:00',
  });
  for (const application of Object.values(state.supabase.applications)) {
    assert.deepEqual(application, { databaseResetReady: true, enabled: true });
  }
  assert.equal(state.supabase.resetVerification.completed, true);
  assert.equal(state.supabase.resetVerification.allApplicationsSucceeded, true);
  assert.equal(state.supabase.resetVerification.recoveryInvocation.failed, 0);
  assert.equal(state.supabase.resetVerification.idempotentInvocation.claimed, 0);
  assert.deepEqual(
    state.supabase.resetVerification.postResetBaselines.cnDefaultLoginsVerified,
    ['admin', 'testteacher', 'teststudent'],
  );
  assert.equal(state.supabase.resetVerification.postResetBaselines.rcmiMemberCount, 8);
  assert.equal(state.supabase.resetVerification.postResetBaselines.hoursPasswordMutationRejected, true);
  assert.equal(state.netlifySitesCreated, state.phase === '4.4');
  assert.equal(state.cloudflareSubdomainsConfigured, false);
  assert.equal(state.portfolioUpdated, false);
});
