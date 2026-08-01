import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseCli = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const localSeed = path.join(root, 'supabase', 'local', 'cn-default-accounts.sql');
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'cn-local-'));
const localProjectRoot = path.join(tempDirectory, 'project');
const localSupabaseRoot = path.join(localProjectRoot, 'supabase');
const localFunctionEnv = path.join(tempDirectory, 'cn-functions.env');
const deploymentOnlyMigrations = new Set([
  '20260722000700_activate_daily_resets.sql',
  '20260722000800_verify_persistent_reset_handlers.sql',
  '20260722000900_verify_reset_orchestration.sql',
  '20260722001000_make_reset_deletes_data_api_safe.sql',
  '20260722001100_add_private_cron_run_status.sql',
]);

async function prepareLocalProject() {
  await mkdir(path.join(localSupabaseRoot, 'migrations'), { recursive: true });
  const config = await readFile(path.join(root, 'supabase', 'config.toml'), 'utf8');
  await writeFile(
    path.join(localSupabaseRoot, 'config.toml'),
    config.replace('project_id = "portfolio-live-demos"', 'project_id = "portfolio-live-demos-cn-local"'),
    'utf8',
  );
  await cp(path.join(root, 'supabase', 'seed.sql'), path.join(localSupabaseRoot, 'seed.sql'));
  await cp(path.join(root, 'supabase', 'functions'), path.join(localSupabaseRoot, 'functions'), { recursive: true });
  const localCnApiPath = path.join(localSupabaseRoot, 'functions', 'cn-api', 'index.ts');
  const cnApi = await readFile(localCnApiPath, 'utf8');
  const localCnApi = cnApi.replace('auth: "publishable:cn_demo"', 'auth: "publishable"');
  if (localCnApi === cnApi) throw new Error('Could not apply the local-only CN publishable-key profile.');
  await writeFile(localCnApiPath, localCnApi, 'utf8');
  const migrations = await readdir(path.join(root, 'supabase', 'migrations'));
  for (const migration of migrations) {
    if (!migration.endsWith('.sql') || deploymentOnlyMigrations.has(migration)) continue;
    await cp(
      path.join(root, 'supabase', 'migrations', migration),
      path.join(localSupabaseRoot, 'migrations', migration),
    );
  }
}

function runCli(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [supabaseCli, ...args, '--workdir', localProjectRoot], {
    cwd: root,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(sanitizedCliError(result.stderr));
    throw new Error(`Supabase command failed: ${args.join(' ')}`);
  }
  return capture ? result.stdout : '';
}

function sanitizedCliError(value) {
  return String(value || '')
    .replaceAll(/sb_secret_[A-Za-z0-9_-]+/g, '[redacted-local-secret]')
    .replaceAll(/postgresql:\/\/[^\s]+/g, '[redacted-local-db-url]')
    .replaceAll(/eyJ[A-Za-z0-9._-]{40,}/g, '[redacted-local-jwt]');
}

function nestedValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(nestedValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(nestedValues);
  return [];
}

function localStatus() {
  const output = runCli(['status', '-o', 'json'], { capture: true });
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Could not read local Supabase status.');
  const status = JSON.parse(output.slice(start, end + 1));
  const values = nestedValues(status);
  const publishableKey = values.find((value) => /^sb_publishable_[A-Za-z0-9_-]+$/.test(value));
  const apiUrl = values.find((value) => /^http:\/\/(?:127\.0\.0\.1|localhost):54321\/?$/.test(value));
  if (!publishableKey || !apiUrl) throw new Error('Local Supabase URL or publishable key is unavailable.');
  return { apiUrl: apiUrl.replace(/\/$/, ''), publishableKey };
}

console.log('Starting the isolated local Supabase stack...');
try {
  await prepareLocalProject();
  runCli(['start'], { capture: true });
} catch (error) {
  await rm(tempDirectory, { recursive: true, force: true });
  console.error(`\nLocal Supabase could not start: ${error.message}`);
  console.error('Make sure Docker Desktop is running.');
  process.exit(1);
}

console.log('Rebuilding only the local database from committed migrations...');
runCli(['db', 'reset', '--local', '--yes']);
runCli(['db', 'query', '--local', '--file', localSeed]);

const { apiUrl, publishableKey } = localStatus();
if (!apiUrl.startsWith('http://127.0.0.1:') && !apiUrl.startsWith('http://localhost:')) {
  throw new Error('Refusing to start CN local development against a non-loopback Supabase URL.');
}
await writeFile(localFunctionEnv, `CN_LOCAL_PUBLIC_SUPABASE_URL=${apiUrl}\n`, 'utf8');

console.log('Local database ready: admin, testteacher, and teststudent (password: password; no class data).');
console.log('Local private image Storage ready: uploads and signed URLs stay on 127.0.0.1.');
console.log('CN app: http://localhost:5173');
console.log('Supabase Studio: http://127.0.0.1:54323');
console.log('Press Ctrl+C to stop the app; the local Supabase containers will remain available.\n');

const functionProcess = spawn(
  process.execPath,
  [
    supabaseCli,
    'functions',
    'serve',
    'cn-api',
    '--no-verify-jwt',
    '--env-file',
    localFunctionEnv,
    '--workdir',
    localProjectRoot,
  ],
  { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true },
);
const frontendProcess = spawn(
  process.execPath,
  [viteCli, '--host', '127.0.0.1', '--port', '5173'],
  {
    cwd: path.join(root, 'apps', 'cn'),
    env: {
      ...process.env,
      VITE_SUPABASE_URL: apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);

const children = [functionProcess, frontendProcess];
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await rm(tempDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    void shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown) void shutdown(code || (signal ? 1 : 0));
  });
}
