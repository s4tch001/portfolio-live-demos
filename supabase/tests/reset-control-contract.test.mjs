import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260722000100_demo_reset_control.sql",
  import.meta.url
);
const functionUrl = new URL("../functions/reset-coordinator/index.ts", import.meta.url);
const configUrl = new URL("../config.toml", import.meta.url);

async function contents(url) {
  return readFile(url, "utf8");
}

test("migration defines five disabled allowlisted applications", async () => {
  const sql = await contents(migrationUrl);
  for (const app of ["cn", "rcmi", "hours", "payroll", "travels"]) {
    assert.match(sql, new RegExp("\\('" + app + "', '" + app + "-demo\\.pauuu\\.dev'"));
  }
  assert.match(sql, /enabled boolean not null default false/i);
  assert.match(sql, /database_reset_ready boolean not null default false/i);
  assert.match(sql, /Asia\/Manila/);
  assert.match(sql, /on conflict on constraint reset_runs_app_day_key do nothing/i);
});

test("migration enforces idempotent leased transitions and partial recovery", async () => {
  const sql = await contents(migrationUrl);
  assert.match(sql, /unique \(app_id, logical_date\)/i);
  assert.match(sql, /for update of reset_run skip locked/i);
  assert.match(sql, /lease_expires_at <= p_now/i);
  assert.match(sql, /when reset_run\.database_cleared_at is null then 'running'/i);
  assert.match(sql, /else 'storage_pending'/i);
  assert.match(sql, /database_cleared_at = coalesce/i);
  assert.match(sql, /state = 'succeeded'/i);
});

test("private tables use RLS and only service_role receives wrapper execution", async () => {
  const sql = await contents(migrationUrl);
  assert.equal((sql.match(/enable row level security/gi) ?? []).length, 2);
  assert.equal((sql.match(/force row level security/gi) ?? []).length, 2);
  assert.match(sql, /revoke all on schema demo_control from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on all tables in schema demo_control/i);
  assert.equal((sql.match(/alter default privileges in schema demo_control/gi) ?? []).length, 3);
  assert.equal((sql.match(/security definer/gi) ?? []).length, 10);
  assert.equal((sql.match(/set search_path = ''/gi) ?? []).length, 10);
  assert.equal((sql.match(/grant execute on function public\./gi) ?? []).length, 5);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:anon|authenticated)/i);
});

test("database handlers are fixed identifiers and never interpolated as raw values", async () => {
  const sql = await contents(migrationUrl);
  assert.match(sql, /handler_schema name not null/i);
  assert.match(sql, /handler_function name not null/i);
  assert.match(sql, /format\('%I\.%I\(date\)'/i);
  assert.match(sql, /execute format\([\s\S]*?'select %I\.%I\(\$1\)'/i);
  assert.doesNotMatch(sql, /execute\s+application\./i);
  assert.doesNotMatch(sql, /delete\s+from\s+storage\.objects/i);
});

test("Edge coordinator uses named secret authentication and bounded cleanup", async () => {
  const [source, config] = await Promise.all([contents(functionUrl), contents(configUrl)]);
  assert.match(source, /npm:@supabase\/server@1\.4\.0/);
  assert.match(source, /auth: "secret:automations"/);
  assert.match(source, /request\.method !== "POST"/);
  assert.match(source, /claims\.slice\(0, 5\)/);
  assert.match(source, /cache-control/);
  assert.doesNotMatch(source, /Deno\.env|getenv|SUPABASE_SECRET|service_role/i);
  assert.match(config, /\[functions\.reset-coordinator\]\s+verify_jwt = false/m);
});
