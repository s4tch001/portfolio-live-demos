import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const appIds = ['cn', 'rcmi', 'hours', 'payroll', 'travels'];
const workspaceNames = {
  cn: '@pauuu-demo/cn',
  rcmi: '@pauuu-demo/rcmi',
  hours: '@pauuu-demo/hours',
  payroll: '@pauuu-demo/payroll',
  travels: '@pauuu-demo/travels',
};

test('each demo has an isolated root-built Netlify monorepo configuration', async () => {
  const metadata = JSON.parse(await read('config/netlify-sites.json'));

  assert.equal(metadata.plan, 'Free');
  assert.equal(metadata.repository, 's4tch001/portfolio-live-demos');
  assert.equal(metadata.baseDirectory, null);
  assert.deepEqual(Object.keys(metadata.sites), appIds);

  for (const appId of appIds) {
    const config = await read(`apps/${appId}/netlify.toml`);
    const site = metadata.sites[appId];
    assert.match(config, new RegExp(`command = "npm run build --workspace ${workspaceNames[appId]}"`));
    assert.match(config, new RegExp(`publish = "apps/${appId}/dist"`));
    assert.match(config, new RegExp(`ignore = "git diff --quiet \\$CACHED_COMMIT_REF \\$COMMIT_REF apps/${appId}`));
    assert.doesNotMatch(config, /^\s*base\s*=/m);
    assert.equal(site.packageDirectory, `apps/${appId}`);
    assert.equal(site.publishDirectory, `apps/${appId}/dist`);
    assert.equal(site.customHostname, `${appId}-demo.pauuu.dev`);
    assert.match(site.siteId, /^[0-9a-f-]{36}$/);
    assert.equal(site.netlifyUrl, `https://pauuu-${appId}-demo.netlify.app`);
    assert.match(site.productionDeployId, /^[0-9a-f]{24}$/);
  }
});

test('deployment record captures five isolated Free production previews', async () => {
  const metadata = JSON.parse(await read('config/netlify-sites.json'));
  const state = JSON.parse(await read('config/deployment-state.json'));

  assert.ok(['4.4', '4.5'].includes(state.phase));
  assert.equal(state.netlifySitesCreated, true);
  assert.equal(state.cloudflareSubdomainsConfigured, state.phase === '4.5');
  assert.equal(state.portfolioUpdated, false);
  assert.equal(state.netlify.plan, 'Free');
  assert.equal(state.netlify.deploymentMode, 'manual-atomic');
  assert.deepEqual(Object.keys(state.netlify.sites), appIds);

  for (const appId of appIds) {
    const site = state.netlify.sites[appId];
    assert.equal(site.siteId, metadata.sites[appId].siteId);
    assert.equal(site.siteName, metadata.sites[appId].preferredSiteName);
    assert.equal(site.url, metadata.sites[appId].netlifyUrl);
    assert.equal(site.productionDeployId, metadata.sites[appId].productionDeployId);
    if (state.phase === '4.5') assert.equal(site.customUrl, metadata.sites[appId].customUrl);
  }

  for (const marker of ['completed', 'https200', 'securityHeaders', 'noindex', 'immutableAssets', 'spaRoutes', 'appApis']) {
    assert.equal(state.netlify.liveVerification[marker], true);
  }
});

test('every site applies the public-preview security header baseline', async () => {
  for (const appId of appIds) {
    const config = await read(`apps/${appId}/netlify.toml`);
    for (const marker of [
      'Content-Security-Policy',
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      'Cross-Origin-Opener-Policy = "same-origin"',
      'Permissions-Policy',
      'Referrer-Policy = "no-referrer"',
      'Strict-Transport-Security',
      'X-Content-Type-Options = "nosniff"',
      'X-Frame-Options = "DENY"',
      'X-Robots-Tag = "noindex, nofollow, noarchive, nosnippet, noimageindex"',
    ]) {
      assert.ok(config.includes(marker), `${appId} is missing ${marker}`);
    }
    assert.doesNotMatch(config, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(config, /service_role|SUPABASE_SECRET_KEY|SUPABASE_DB_PASSWORD/);
  }
});

test('only persistent demos allow the exact Supabase host and require public build variables', async () => {
  const metadata = JSON.parse(await read('config/netlify-sites.json'));
  for (const appId of ['cn', 'rcmi', 'hours']) {
    const config = await read(`apps/${appId}/netlify.toml`);
    const edge = await read(`supabase/functions/${appId}-api/index.ts`);
    assert.match(config, /connect-src[^\n]*https:\/\/ivqfxdibluhgyttgxbmz\.supabase\.co/);
    assert.match(edge, new RegExp(`https://pauuu-${appId}-demo\\.netlify\\.app`));
    assert.match(edge, new RegExp(`https://${appId}-demo\\.pauuu\\.dev`));
    assert.deepEqual(metadata.sites[appId].publicEnvironment, [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    ]);
  }
  for (const appId of ['payroll', 'travels']) {
    const config = await read(`apps/${appId}/netlify.toml`);
    assert.doesNotMatch(config, /supabase\.co/i);
    assert.deepEqual(metadata.sites[appId].publicEnvironment, []);
  }
});

test('router apps use SPA fallbacks and CN has no inline executable script', async () => {
  for (const appId of ['cn', 'rcmi']) {
    const config = await read(`apps/${appId}/netlify.toml`);
    assert.match(config, /from = "\/\*"[\s\S]*to = "\/index\.html"[\s\S]*status = 200/);
  }

  const cnHtml = await read('apps/cn/index.html');
  assert.match(cnHtml, /<script src="\/prepaint-theme\.js"><\/script>/);
  assert.doesNotMatch(cnHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(await read('apps/cn/public/prepaint-theme.js'), /document\.documentElement\.setAttribute\('data-theme'/);
});
