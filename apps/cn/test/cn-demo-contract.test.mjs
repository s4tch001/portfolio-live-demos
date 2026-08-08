import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { manilaDateKey, manilaToday } from '../src/lib/format.js';

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

test('local walkthrough launcher is loopback-only and starts with only the three default accounts', async () => {
  const launcher = await read('scripts/dev-cn-local.mjs');
  const localSeed = await read('supabase/local/cn-default-accounts.sql');
  assert.match(launcher, /db', 'reset', '--local'/);
  assert.match(launcher, /db', 'query', '--local'/);
  assert.match(launcher, /Refusing to start CN local development against a non-loopback Supabase URL/);
  assert.match(launcher, /replace\('auth: "publishable:cn_demo"', 'auth: "publishable"'\)/);
  assert.match(launcher, /portfolio-live-demos-cn-local/);
  assert.match(launcher, /deploymentOnlyMigrations/);
  assert.match(launcher, /CN_LOCAL_PUBLIC_SUPABASE_URL=\$\{apiUrl\}/);
  assert.match(launcher, /'--env-file',[\s\S]*localFunctionEnv/);
  assert.doesNotMatch(launcher, /ivqfxdibluhgyttgxbmz|\.supabase\.co/);
  assert.match(localSeed, /where app_id = 'cn'/);
  assert.match(localSeed, /delete from cn_demo\.teachers/);
  assert.match(localSeed, /delete from cn_demo\.students/);
  assert.match(localSeed, /'admin'[\s\S]*'password'/);
  assert.match(localSeed, /'testteacher'[\s\S]*'password'/);
  assert.match(localSeed, /'teststudent'[\s\S]*'password'/);
  assert.match(localSeed, /delete from cn_demo\.schedules/);
  assert.match(localSeed, /delete from cn_demo\.reports/);
  assert.match(localSeed, /delete from cn_demo\.class_transactions/);
  assert.doesNotMatch(launcher, /VITE_CN_LOCAL_ADMIN_ONLY/);
});

test('Windows local tool manages only the isolated CN project', async () => {
  const tool = await read('tool.ps1');
  assert.match(tool, /portfolio-live-demos-cn-local/);
  assert.match(tool, /npm\.cmd run dev:cn-local/);
  assert.match(tool, /stop --project-id \$LocalProjectId --no-backup/);
  assert.match(tool, /docker desktop start/);
  assert.match(tool, /docker desktop stop/);
  assert.match(tool, /1\. START[\s\S]*2\. STOP[\s\S]*3\. STOP ALL[\s\S]*4\. STATUS/);
  assert.match(tool, /Invalid selection/);
  assert.match(tool, /Warning: this can stop other local Docker projects/);
  assert.match(tool, /GetTempPath\(\)/);
  assert.match(tool, /CnTempPrefix = 'cn-local-'/);
  assert.match(tool, /Refusing cleanup outside the expected CN temp path/);
  assert.match(tool, /Keeping active CN temp workdir/);
  assert.match(tool, /Remove-Item -LiteralPath \$target -Recurse -Force/);
  assert.match(tool, /Supabase emits a UTF-8 animated spinner/);
  assert.match(tool, /stop --project-id \$LocalProjectId --no-backup \*> \$null/);
  assert.match(tool, /Could not stop the CN local Supabase containers/);
  assert.doesNotMatch(tool, /--linked|db push|ivqfxdibluhgyttgxbmz|\.supabase\.co/);
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
    await read('supabase/migrations/20260730000100_enforce_cn_completed_class_usage.sql'),
    await read('supabase/migrations/20260730000200_enforce_cn_schedule_capacity.sql'),
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
  assert.match(migration, /create trigger charge_completed_report/);
  assert.match(migration, /schedule_row\.cancelled or schedule_row\.trial/);
  assert.match(migration, /remaining_classes = greatest\(0, remaining_classes - 1\)/);
  assert.match(migration, /where usage\.schedule_id = schedule_row\.id/);
  assert.match(migration, /and transaction\.student_id = target_student_id/);
  assert.match(migration, /create trigger refund_cancelled_schedule_usage/);
  assert.match(migration, /create trigger refund_deleted_schedule_usage/);
  assert.match(migration, /remaining_classes = remaining_classes \+ 1/);
  assert.match(migration, /create trigger enforce_schedule_capacity/);
  assert.match(migration, /pg_advisory_xact_lock\(new\.student_id\)/);
  assert.match(migration, /numeric_balance - reserved_classes <= 0/);
  assert.match(migration, /message = 'student_no_remaining_classes'/);
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

test('adds CN reports only after their Manila schedule date is complete', async () => {
  const anchorMigration = await read('supabase/migrations/20260808000100_anchor_demo_dates_to_manila_month.sql');
  const dailyMigration = await read('supabase/migrations/20260808000200_progress_demo_data_after_day_end.sql');
  assert.match(anchorMigration, /revoke all on function cn_demo\.reset_demo_data_month_source\(date\)/);
  assert.match(dailyMigration, /reset_demo_data_month_source\(p_logical_date\)/);
  assert.match(dailyMigration, /report\.date >= p_logical_date/);
  assert.match(dailyMigration, /usage\.date >= p_logical_date/);
  assert.match(dailyMigration, /remaining_classes = greatest/);
  assert.match(dailyMigration, /revoke all on function cn_demo\.reset_demo_data\(date\)/);
  assert.equal(manilaDateKey(new Date('2026-07-31T15:59:59.999Z')), '2026-07-31');
  assert.equal(manilaDateKey(new Date('2026-07-31T16:00:00.000Z')), '2026-08-01');
  assert.equal(manilaToday(new Date('2026-07-31T16:00:00.000Z')).getMonth(), 7);
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
  assert.doesNotMatch(edge, /refundScheduleUsage/);
  assert.doesNotMatch(edge, /chargeReportUsage/);
  assert.match(edge, /schedule_teacher_id: schedule\?\.teacher_id/);
  assert.match(edge, /report_id: report\?\.id/);
  assert.match(edge, /report_absent_reason: report\?\.absent_reason/);
  assert.match(edge, /report_tracker_remarks: report\?\.tracker_remarks/);
  assert.match(edge, /params\.get\("schedule_id"\)/);
  assert.match(edge, /requireScheduleCapacity/);
  assert.match(edge, /numericBalance - reservedClasses <= 0/);
  assert.match(edge, /student_no_remaining_classes/);
  assert.match(edge, /requireReportScheduleAccess/);
  assert.match(edge, /cannot_move_report_schedule/);
  assert.match(edge, /path !== "\/logs"/);
  assert.match(edge, /studentScheduleIds/);
  assert.match(edge, /MAX_UPLOAD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(edge, /existing\.length >= 20/);
  assert.match(edge, /100 \* 1024 \* 1024/);
  assert.match(edge, /Deno\.env\.get\("CN_LOCAL_PUBLIC_SUPABASE_URL"\)/);
  assert.match(edge, /publicBase\.hostname === "127\.0\.0\.1"/);
  assert.match(edge, /signed\.pathname\.startsWith\("\/storage\/v1\/"\)/);
  assert.match(edge, /browserReachableStorageUrl\(signed\.data\.signedUrl\)/);
  assert.match(edge, /new RegExp\(`\^\$\{year\}-\(\\\\d\{3,\}\)\$`\)/);
  assert.match(edge, /String\(highestSequence \+ 1\)\.padStart\(3, "0"\)/);
  assert.doesNotMatch(edge, /`DEMO-\$\{new Date\(\)\.getFullYear\(\)\}-\$\{crypto\.randomUUID/);
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

test('does not open the Add Student modal during the Strict Mode mount replay', async () => {
  const studentsPage = await read('apps/cn/src/pages/StudentsPage/StudentsPage.jsx');
  assert.match(studentsPage, /const previousAddSignal = useRef\(openAddSignal\)/);
  assert.match(studentsPage, /if \(openAddSignal === previousAddSignal\.current\) return/);
  assert.doesNotMatch(studentsPage, /firstAddSignal/);
});
