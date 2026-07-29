import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('replaces all visible lorem text with meaningful preview copy', async () => {
  const [hero, about] = await Promise.all([
    read('apps/travels/src/components/Hero.jsx'),
    read('apps/travels/src/components/About.jsx'),
  ]);
  assert.doesNotMatch(`${hero}\n${about}`, /lorem|ipsum/i);
  assert.match(hero, /local experiences across the Philippines/);
  assert.match(about, /no booking or payment is\s+processed/);
});

test('keeps eight fictional Philippine tour cards', async () => {
  const data = await read('apps/travels/src/data.js');
  const tours = data.split('export const toursData = [')[1] ?? '';
  const ids = tours.match(/\n    id: \d+,/g) ?? [];
  assert.equal(ids.length, 8);
  assert.match(data, /Boracay Island Escape/);
  assert.match(data, /Batanes Nature Escape/);
});

test('uses the shared preview notice and indexable metadata', async () => {
  const [entry, html, robots] = await Promise.all([
    read('apps/travels/src/main.jsx'),
    read('apps/travels/index.html'),
    read('apps/travels/public/robots.txt'),
  ]);
  assert.match(entry, /portfolio-demo-notice project-id="travels"/);
  assert.match(html, /index, follow, max-image-preview:large/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/travels-demo\.pauuu\.dev\/sitemap\.xml/);
});

test('keeps the fixed navbar and mobile menu below the dynamic preview notice', async () => {
  const css = await read('apps/travels/src/index.css');
  assert.match(css, /\.navbar\s*\{[\s\S]*top: var\(--portfolio-demo-notice-height, 0px\)/);
  assert.match(css, /\.nav-dropdown\s*\{[\s\S]*top: calc\(var\(--portfolio-demo-notice-height, 0px\) \+ 4rem\)/);
});

test('does not link the demo logo to the original production deployment', async () => {
  const navbar = await read('apps/travels/src/components/Navbar.jsx');
  assert.match(navbar, /href='#home'/);
  assert.doesNotMatch(navbar, /p-travels\.netlify\.app/);
  assert.match(navbar, /rel='noreferrer'/);
});

test('stores no visitor data and leaves reset activation disabled', async () => {
  const migration = await read('supabase/migrations/20260722000600_travels_demo.sql');
  assert.doesNotMatch(migration, /create table/i);
  assert.match(migration, /persists no visitor data/);
  assert.match(migration, /database_reset_ready = true/);
  assert.match(migration, /service_role/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});
