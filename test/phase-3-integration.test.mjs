import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const appIds = ['cn', 'rcmi', 'hours', 'payroll', 'travels'];

test('all five application workspaces are buildable Phase 3 demos', async () => {
  for (const appId of appIds) {
    const packageJson = JSON.parse(await read(`apps/${appId}/package.json`));
    assert.equal(packageJson.name, `@pauuu-demo/${appId}`);
    assert.equal(packageJson.version, '0.1.0');
    assert.equal(typeof packageJson.scripts?.build, 'string');
    assert.equal(typeof packageJson.scripts?.test, 'string');
    assert.equal(packageJson.dependencies?.['@pauuu-demo/demo-shell'], '0.2.0');
  }
});

test('all five static documents include crawler directives', async () => {
  for (const appId of appIds) {
    const html = await read(`apps/${appId}/index.html`);
    assert.match(html, /noindex, nofollow, noarchive, nosnippet, noimageindex/);
  }
});

test('all five UIs install their matching persistent preview notice', async () => {
  const entries = {
    cn: 'apps/cn/src/main.jsx',
    rcmi: 'apps/rcmi/src/main.jsx',
    hours: 'apps/hours/index.html',
    payroll: 'apps/payroll/index.html',
    travels: 'apps/travels/src/main.jsx',
  };
  for (const [appId, entry] of Object.entries(entries)) {
    const content = await read(entry);
    assert.match(content, new RegExp(`portfolio-demo-notice project-id=["']${appId}["']`));
  }
});

test('each registered app has a private reset handler migration', async () => {
  const migrations = {
    cn: '20260722000200_cn_demo.sql',
    rcmi: '20260722000300_rcmi_demo.sql',
    hours: '20260722000400_hours_demo.sql',
    payroll: '20260722000500_payroll_demo.sql',
    travels: '20260722000600_travels_demo.sql',
  };
  for (const [appId, filename] of Object.entries(migrations)) {
    const migration = await read(`supabase/migrations/${filename}`);
    assert.match(migration, new RegExp(`create or replace function ${appId}_demo\\.reset_demo_data`));
    assert.match(migration, /database_reset_ready = true/);
    assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
  }
});

test('Phase 3 does not add a deployment or reset schedule', async () => {
  const rootPackage = await read('package.json');
  const config = await read('supabase/config.toml');
  assert.doesNotMatch(rootPackage, /netlify deploy|supabase db push|supabase functions deploy/i);
  assert.doesNotMatch(config, /\[functions\.(?:payroll|travels)-api\]/);
});
