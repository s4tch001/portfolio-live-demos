import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const appIds = ['cn', 'rcmi', 'hours', 'payroll', 'travels'];

test('Phase 4.5 records five exact DNS-only custom preview hostnames', async () => {
  const metadata = JSON.parse(await read('config/netlify-sites.json'));
  const state = JSON.parse(await read('config/deployment-state.json'));

  assert.equal(state.phase, '4.5');
  assert.equal(state.cloudflareSubdomainsConfigured, true);
  assert.equal(state.portfolioUpdated, true);
  assert.equal(state.cloudflare.plan, 'Free');
  assert.equal(state.cloudflare.zone, 'pauuu.dev');
  assert.equal(state.cloudflare.proxyMode, 'dns-only');
  assert.equal(state.cloudflare.ttl, 'auto');
  assert.equal(state.cloudflare.httpsVerified, true);
  assert.equal(state.netlify.liveVerification.rcmiAdministratorNavigationHint, true);

  for (const appId of appIds) {
    const site = metadata.sites[appId];
    const record = state.cloudflare.records[appId];
    assert.equal(site.customHostname, `${appId}-demo.pauuu.dev`);
    assert.equal(site.customUrl, `https://${appId}-demo.pauuu.dev`);
    assert.equal(site.dnsTarget, `pauuu-${appId}-demo.netlify.app`);
    assert.deepEqual(record, {
      hostname: site.customHostname,
      type: 'CNAME',
      target: site.dnsTarget,
    });
    assert.equal(state.netlify.sites[appId].customUrl, site.customUrl);
  }
});

test('the live verifier defaults to custom hosts and retains an explicit Netlify fallback', async () => {
  const verifier = await read('scripts/verify-netlify-live.mjs');
  assert.match(verifier, /DEMO_HOST_MODE === 'netlify'/);
  assert.match(verifier, /https:\/\/\$\{app\}-demo\.pauuu\.dev/);
  assert.match(verifier, /https:\/\/pauuu-\$\{app\}-demo\.netlify\.app/);
});

test('the measured notice height offsets fixed app UI on every affected demo', async () => {
  const notice = await read('packages/demo-shell/src/demo-notice.js');
  assert.match(notice, /DEMO_NOTICE_HEIGHT_PROPERTY = "--portfolio-demo-notice-height"/);
  assert.match(notice, /ResizeObserver/);
  assert.match(notice, /getBoundingClientRect/);
  assert.match(notice, /style\?\.setProperty\?\.\(DEMO_NOTICE_HEIGHT_PROPERTY/);

  for (const relativePath of [
    'apps/cn/src/App.jsx',
    'apps/cn/src/styles/styles.css',
    'apps/rcmi/src/styles.css',
    'apps/hours/assets/css/styles.css',
    'apps/travels/src/index.css',
  ]) {
    assert.match(await read(relativePath), /--portfolio-demo-notice-height/);
  }
});

test('RCMI notice exposes the unlinked manual administrator route', async () => {
  const contracts = await read('packages/demo-shell/src/contracts.js');
  assert.match(contracts, /Administrator page: manually open \/administrator in the address bar/);
});

test('persistent APIs allow exact custom origins without wildcard CORS', async () => {
  for (const appId of ['cn', 'rcmi', 'hours']) {
    const source = await read(`supabase/functions/${appId}-api/index.ts`);
    assert.match(source, new RegExp(`https://${appId}-demo\\.pauuu\\.dev`));
    assert.doesNotMatch(source, /allowOrigins\s*:\s*\[[^\]]*["']\*["']/s);
  }
});

test('all demo sites are explicitly available for indexing and crawling', async () => {
  for (const appId of appIds) {
    const index = await read(`apps/${appId}/index.html`);
    const netlify = await read(`apps/${appId}/netlify.toml`);
    const robots = await read(`apps/${appId}/public/robots.txt`);
    assert.match(index, /index, follow, max-image-preview:large/);
    assert.doesNotMatch(netlify, /X-Robots-Tag/);
    assert.match(robots, /User-agent: \*/);
    assert.match(robots, /Allow: \//);
    assert.match(robots, new RegExp(`Sitemap: https://${appId}-demo\\.pauuu\\.dev/sitemap\\.xml`));
  }
});
