import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(appRoot, '..', '..');

async function read(relativePath) {
  return readFile(path.join(workspaceRoot, relativePath), 'utf8');
}

test('shows only the three approved immutable preview credentials', async () => {
  const login = await read('apps/cn/src/pages/LoginPage/LoginPage.jsx');
  assert.match(login, /admin<\/code> \/ <code>password/);
  assert.match(login, /testteacher<\/code> \/ <code>password/);
  assert.match(login, /teststudent<\/code> \/ <code>password/);
  assert.doesNotMatch(login, /devpau<\/code>/i);
  assert.match(login, /cannot be changed/i);
});

test('keeps restricted CN navigation behind non-preview master checks', async () => {
  const navigation = await read('apps/cn/src/components/Layout/navConfig.js');
  const remaining = await read('apps/cn/src/pages/RemainingClassesPage/remainingConstants.js');
  const permissions = await read('apps/cn/src/context/AuthContext.jsx');
  assert.match(navigation, /security[^\n]+master: true/);
  assert.match(remaining, /permissions[^\n]+view_permissions/);
  assert.match(remaining, /devtools[^\n]+master: true/);
  assert.match(permissions, /username[^\n]+devpau/);
});

test('database protects demo credentials and rejects the reserved master username', async () => {
  const migration = [
    await read('supabase/migrations/20260722000200_cn_demo.sql'),
    await read('supabase/migrations/20260726000100_enrich_cn_rcmi_preview_data.sql'),
    await read('supabase/migrations/20260726000200_expand_preview_activity_data.sql'),
    await read('supabase/migrations/20260729000100_refine_cn_preview_school_data.sql'),
    await read('supabase/migrations/20260729000200_enable_cn_login_blocked_status.sql'),
    await read('supabase/migrations/20260729000300_vary_cn_preview_absence_reasons.sql'),
  ].join('\n');
  assert.match(migration, /lower\(coalesce\(new\.username, ''\)\) = 'devpau'/);
  assert.match(migration, /old\.protected/);
  assert.match(migration, /protected demo credential/);
  assert.match(migration, /protected demo admin must stay active/);
  assert.match(migration, /'admin'.+'password'/s);
  assert.match(migration, /'testteacher'.+'password'/s);
  assert.match(migration, /'teststudent'.+'password'/s);
  assert.match(migration, /delete from cn_demo\.sessions/);
  assert.match(migration, /where app_id = 'cn'/);
  assert.match(migration, /set database_reset_ready = true/);
  assert.match(migration, /status in \('Active', 'Inactive', 'Login Blocked'\)/);
  assert.match(migration, /status in \('Active', 'Inactive', 'End of Contract', 'Login Blocked'\)/);
  assert.match(migration, /new\.absent_reason := 'Late Notice'/);
  assert.match(migration, /new\.absent_reason := 'No Notice'/);
  assert.match(migration, /new\.absent_reason := 'Other'/);
  assert.match(migration, /new\.absent_other := 'Family schedule conflict'/);
  assert.match(migration, /current_setting\('cn_demo\.reset_context', true\) = 'on'/);
  assert.doesNotMatch(migration, /set[^;]*enabled\s*=\s*true/i);
});

test('database seeds richer current-month CN preview data without exposing extra credentials', async () => {
  const migration = await read('supabase/migrations/20260729000100_refine_cn_preview_school_data.sql');
  const slotMigration = await read('supabase/migrations/20260726000300_normalize_cn_preview_schedule_slots.sql');
  assert.match(migration, /month_start date := date_trunc\('month', p_logical_date\)::date/);
  assert.match(migration, /month_end date :=/);
  assert.match(migration, /Grace Mendoza/);
  assert.match(migration, /Amanda Reyes/);
  assert.match(migration, /Miguel Santos/);
  assert.match(migration, /Sophia Lim/);
  assert.match(migration, /Isabella Ramos/);
  assert.match(migration, /Olivia Park/);
  assert.match(migration, /s\.id between 1 and 16/);
  assert.match(migration, /extract\(isodow from d\) between 1 and 5/);
  assert.match(migration, /'08:00 - 08:25'/);
  assert.match(migration, /'10:30 - 10:55'/);
  assert.match(migration, /'13:00 - 13:25'/);
  assert.match(migration, /'15:30 - 15:55'/);
  assert.match(migration, /'17:00 - 17:25'/);
  assert.match(migration, /'19:30 - 19:55'/);
  assert.match(migration, /'21:30 - 21:55'/);
  assert.match(migration, /for student_row in/);
  assert.match(migration, /'25 mins'/);
  assert.doesNotMatch(migration, /09:00 - 09:45|17:00 - 17:45|45 minutes/);
  assert.match(slotMigration, /normalize_preview_schedule_slot/);
  assert.match(slotMigration, /before insert or update of timeslot, note on cn_demo\.schedules/);
  assert.match(slotMigration, /'09:00 - 09:45' then '10:00 - 10:25'/);
  assert.match(slotMigration, /set class_duration = '25 mins'/);
  assert.match(slotMigration, /set duration = '25 mins'/);
  assert.match(migration, /New student; use short instructions/);
  assert.match(migration, /Oxford Discover 2, pages 34-37/);
  assert.match(migration, /else ''/);
  assert.match(migration, /is_cancelled := .* % 19 = 0/);
  assert.match(migration, /class_usage/);
  assert.match(migration, /low remaining class balance/);
  assert.match(migration, /https:\/\/example\.com\/demo-class-session/);
  assert.match(migration, /update cn_demo\.class_transactions tx/);
  assert.match(migration, /activity_logs/);
  assert.doesNotMatch(await read('apps/cn/src/pages/LoginPage/LoginPage.jsx'), /amanda\.reyes|liam\.garcia|isabella\.ramos/);
});

test('CN Edge adapter returns frontend-ready receipts and yearly summaries', async () => {
  const edge = await read('supabase/functions/cn-api/index.ts');
  assert.match(edge, /return \{\s*receipts: page,/);
  assert.match(edge, /nextBefore: page\.length/);
  assert.match(edge, /hasMore: startIndex \+ limit < receipts\.length/);
  assert.match(edge, /totalReceipts: receiptKeys\.size/);
  assert.match(edge, /topStudents: \[\.\.\.reportStudentStats\.values\(\)\]/);
  assert.match(edge, /reportedScheduleIds/);
  assert.match(edge, /for \(const schedule of schedules\) \{/);
  assert.match(edge, /if \(!schedule\.cancelled\) continue/);
  assert.match(edge, /reportedScheduleIds\.has\(Number\(schedule\.id\)\)/);
  assert.match(edge, /monthlyFeeList/);
  assert.match(edge, /cancelMonthlyList/);
});

test('CN annual monthly-fee details tolerate numeric Supabase amounts', async () => {
  const receiptCard = await read('apps/cn/src/lib/receiptCard.js');
  assert.match(receiptCard, /const clean = \(value\) => String\(value \?\? ''\)\.trim\(\) \|\| '—'/);
  assert.match(receiptCard, /clean\(t\.amount\)/);
  assert.doesNotMatch(receiptCard, /\(\(t\.amount \|\| ''\)\.trim\(\)/);
});

test('CN Edge adapter is origin-bound, rate-limited, and denies master APIs', async () => {
  const edge = await read('supabase/functions/cn-api/index.ts');
  assert.match(edge, /auth: "publishable:cn_demo"/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /https:\/\/pauuu-cn-demo\.netlify\.app/);
  assert.match(edge, /login_temporarily_locked/);
  assert.match(edge, /new Set\(\["admin", "testteacher", "teststudent"\]\)/);
  assert.match(edge, /isRateLimitExempt/);
  assert.match(edge, /const LOGIN_MAX_FAILED = 5/);
  assert.match(edge, /sha256\(`account\|\$\{username\}`\)/);
  assert.match(edge, /failures >= LOGIN_MAX_FAILED/);
  assert.match(edge, /\.update\(\{ status: "Login Blocked" \}\)/);
  assert.match(edge, /account\.status === "Login Blocked"/);
  assert.match(edge, /"Account Login Blocked"/);
  assert.match(edge, /existing\?\.status === "Login Blocked" && row\?\.status === "Active"/);
  assert.match(edge, /ipAttemptKey/);
  assert.match(edge, /ipFailures >= LOGIN_MAX_FAILED_PER_IP/);
  assert.match(edge, /path\.startsWith\("\/dev\/"\)/);
  assert.match(edge, /path\.startsWith\("\/admin-permissions"\)/);
  assert.match(edge, /demo_credentials_immutable/);
  assert.match(edge, /protected_demo_admin_must_stay_active/);
  assert.match(edge, /chargeReportUsage/);
  assert.match(edge, /refundScheduleUsage/);
  assert.match(edge, /requireReportScheduleAccess/);
  assert.match(edge, /cannot_move_report_schedule/);
  assert.match(edge, /path !== "\/logs"/);
  assert.match(edge, /studentScheduleIds/);
  assert.match(edge, /MAX_UPLOAD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(edge, /existing\.length >= 20/);
  assert.match(edge, /100 \* 1024 \* 1024/);
  assert.doesNotMatch(edge, /select\("id,username,password_hash,fullname,name,status,language"\)/);
  assert.match(edge, /students"\)\.select\("id,name,username,notes,status"\)/);
  assert.match(edge, /candidate === "student"[\s\S]*password_hash,name,status,language[\s\S]*password_hash,fullname,status,language/);
  assert.match(edge, /role === "student"[\s\S]*id,username,name,status,language[\s\S]*id,username,fullname,status,language/);
});

test('CN demo root is indexable and points crawlers to its sitemap', async () => {
  const index = await read('apps/cn/index.html');
  const robots = await read('apps/cn/public/robots.txt');
  const netlify = await read('apps/cn/netlify.toml');
  assert.match(index, /index, follow, max-image-preview:large/);
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/cn-demo\.pauuu\.dev\/sitemap\.xml/);
  assert.doesNotMatch(netlify, /X-Robots-Tag/);
});

test('CN public pages describe student access and use a dummy support email', async () => {
  const landing = await read('apps/cn/src/pages/public/LandingPage.jsx');
  const strings = await read('apps/cn/src/i18n/strings.js');
  const legal = await read('apps/cn/src/i18n/legal.js');
  const legalDoc = await read('apps/cn/src/pages/public/LegalDoc.jsx');
  const footer = await read('apps/cn/src/components/Layout/Footer.jsx');
  assert.match(landing, /landing\.audience\.students/);
  assert.match(landing, /landing\.audience\.admins[\s\S]*landing\.audience\.teachers[\s\S]*landing\.audience\.students/);
  assert.match(strings, /Students/);
  assert.match(strings, /low-balance notifications/);
  assert.match(strings, /Students can only see their own schedules and class reports/);
  assert.match(legal, /Student accounts are limited to their own schedules/);
  assert.match(legal, /Students must not attempt to access another student/);
  assert.match(legalDoc, /support@example\.com/);
  assert.doesNotMatch(legalDoc, /educonnect@gmail\.com/);
  assert.match(footer, /mailto:sample@example\.com/);
  assert.doesNotMatch(footer, /educonnect@gmail\.com/);
});

test('CN frontend uses only environment-provided public Supabase configuration', async () => {
  const endpoint = await read('apps/cn/src/lib/workerUrl.js');
  const api = await read('apps/cn/src/lib/apiClient.js');
  assert.match(endpoint, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(endpoint, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(endpoint, /ivqfxdibluhgyttgxbmz/);
  assert.match(api, /apikey: SUPABASE_PUBLISHABLE_KEY/);
});

test('keeps the authenticated app shell below the preview notice without a double offset', async () => {
  const [app, appShell, css] = await Promise.all([
    read('apps/cn/src/App.jsx'),
    read('apps/cn/src/components/Layout/AppShell.jsx'),
    read('apps/cn/src/styles/styles.css'),
  ]);
  assert.match(app, /inset: 'var\(--portfolio-demo-notice-height, 0px\) 0 0'/);
  assert.doesNotMatch(appShell, /height:\s*'100vh'/);
  assert.match(css, /#app\s*\{[\s\S]*?height: calc\(100dvh - var\(--portfolio-demo-notice-height, 0px\)\)/);
  assert.match(css, /\.body-wrap\s*\{[\s\S]*?min-height: 0/);
  assert.match(css, /\.main\s*\{[\s\S]*?min-height: 0/);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?position: relative;[\s\S]*?top: auto;[\s\S]*?flex: 0 0 auto/);
  assert.doesNotMatch(css, /\.mobile-nav\s*\{[^}]*top: var\(--portfolio-demo-notice-height, 0px\)/);
  assert.match(css, /\.public-header\s*\{[\s\S]*?top: var\(--portfolio-demo-notice-height, 0px\)/);
  for (const selector of ['modal-overlay', 'link-modal', 'lightbox', 'maintenance-screen', 'hamburger-menu']) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?inset: var\\(--portfolio-demo-notice-height, 0px\\) 0 0`));
  }
});
