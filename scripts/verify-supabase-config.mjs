import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..");
const failures = [];

async function readText(relativePath) {
  return readFile(path.join(workspaceRoot, ...relativePath.split("/")), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function requirePattern(content, pattern, message) {
  if (!pattern.test(content)) {
    failures.push(message);
  }
}

async function main() {
  const [rootPackage, lockfile, project, deployment, config, seed, resetMigration, resetFunction, cnMigration, cnFunction, rcmiMigration, rcmiFunction, hoursMigration, hoursFunction, payrollMigration, travelsMigration, schedulerMigration, safeDeleteMigration, cronStatusMigration] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readJson("config/supabase-project.json"),
    readJson("config/deployment-state.json"),
    readText("supabase/config.toml"),
    readText("supabase/seed.sql"),
    readText("supabase/migrations/20260722000100_demo_reset_control.sql"),
    readText("supabase/functions/reset-coordinator/index.ts"),
    readText("supabase/migrations/20260722000200_cn_demo.sql"),
    readText("supabase/functions/cn-api/index.ts"),
    readText("supabase/migrations/20260722000300_rcmi_demo.sql"),
    readText("supabase/functions/rcmi-api/index.ts"),
    readText("supabase/migrations/20260722000400_hours_demo.sql"),
    readText("supabase/functions/hours-api/index.ts"),
    readText("supabase/migrations/20260722000500_payroll_demo.sql"),
    readText("supabase/migrations/20260722000600_travels_demo.sql"),
    readText("supabase/migrations/20260722000700_activate_daily_resets.sql"),
    readText("supabase/migrations/20260722001000_make_reset_deletes_data_api_safe.sql"),
    readText("supabase/migrations/20260722001100_add_private_cron_run_status.sql")
  ]);

  if (rootPackage.devDependencies?.supabase !== "2.109.1") {
    failures.push("Supabase CLI must remain pinned to version 2.109.1.");
  }

  const lockedCli = lockfile.packages?.["node_modules/supabase"];
  if (
    lockedCli?.version !== "2.109.1" ||
    typeof lockedCli.integrity !== "string" ||
    !lockedCli.integrity.startsWith("sha512-")
  ) {
    failures.push("Supabase CLI lockfile entry is missing, unpinned, or lacks integrity metadata.");
  }

  const lockedServer = lockfile.packages?.["node_modules/@supabase/server"];
  if (
    rootPackage.devDependencies?.["@supabase/server"] !== "1.4.0" ||
    lockedServer?.version !== "1.4.0" ||
    typeof lockedServer.integrity !== "string" ||
    !lockedServer.integrity.startsWith("sha512-")
  ) {
    failures.push("Supabase server wrapper must remain pinned to 1.4.0 with registry integrity metadata.");
  }

  requirePattern(config, /^project_id = "portfolio-live-demos"$/m, "Local Supabase project id is unexpected.");
  requirePattern(config, /^major_version = 17$/m, "Local Postgres major version must be 17.");
  requirePattern(config, /^max_rows = 500$/m, "Data API row limit must remain bounded.");
  requirePattern(config, /^file_size_limit = "2MiB"$/m, "Global local storage upload limit must remain 2 MiB.");
  requirePattern(config, /^enable_anonymous_sign_ins = false$/m, "Anonymous authentication must remain disabled.");
  requirePattern(config, /^minimum_password_length = 8$/m, "Minimum authentication password length must remain eight.");
  requirePattern(config, /^sql_paths = \["\.\/seed\.sql"\]$/m, "Seed path must remain deterministic.");
  requirePattern(
    config,
    /^\[functions\.reset-coordinator\]\r?\nverify_jwt = false$/m,
    "Reset coordinator must use its explicit service-to-service authentication mode."
  );

  requirePattern(
    resetMigration,
    /revoke all on schema demo_control from public, anon, authenticated, service_role/i,
    "Reset control schema must remain private."
  );
  requirePattern(
    resetMigration,
    /for update of reset_run skip locked/i,
    "Reset claims must remain concurrency-safe."
  );
  requirePattern(
    resetFunction,
    /withSupabase\(\{ auth: "secret:automations" \}/,
    "Reset coordinator must accept only the named automation secret key."
  );
  requirePattern(schedulerMigration, /from vault\.decrypted_secrets/i, "Reset scheduler must read its server credentials from Vault.");
  requirePattern(schedulerMigration, /'\*\/15 \* \* \* \*'/, "Reset scheduler must retain its 15-minute retry cadence.");
  requirePattern(schedulerMigration, /'select demo_control\.dispatch_reset_coordinator\(\);'/i, "Cron command must remain secret-free and private.");
  requirePattern(schedulerMigration, /revoke all on function demo_control\.dispatch_reset_coordinator\(\)[\s\S]*service_role/i, "The Vault-backed dispatcher must not be executable by API roles.");
  requirePattern(safeDeleteMigration, /replace\(delete_statement, ';', ' where true;'\)/i, "Persistent reset deletes must satisfy the hosted Data API safety guard.");
  requirePattern(safeDeleteMigration, /reset handler still contains an unconditional DELETE without WHERE/i, "Safe-delete migration must fail if an unconditional reset DELETE remains.");
  requirePattern(cronStatusMigration, /from cron\.job_run_details as run/i, "Private status must retain bounded Cron execution evidence.");
  requirePattern(cronStatusMigration, /grant execute on function public\.get_demo_reset_status\(\) to service_role/i, "Reset status must remain server-only.");
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(schedulerMigration + safeDeleteMigration + cronStatusMigration)) {
    failures.push("Reset scheduler migrations must not contain a secret API-key value.");
  }
  requirePattern(config, /"cn_demo"/, "CN schema must be explicitly listed for the Data API.");
  requirePattern(
    config,
    /^\[functions\.cn-api\]\r?\nverify_jwt = false$/m,
    "CN API must delegate modern publishable-key validation to the server wrapper."
  );
  requirePattern(cnMigration, /revoke all on schema cn_demo from public, anon, authenticated/i, "CN schema must deny browser roles by default.");
  requirePattern(cnMigration, /lower\(coalesce\(new\.username, ''\)\) = 'devpau'/i, "CN schema must reserve the master username.");
  requirePattern(cnMigration, /revoke all on function cn_demo\.reset_demo_data\(date\) from public, anon, authenticated, service_role/i, "CN reset handler must not be directly executable by API roles.");
  requirePattern(cnFunction, /withSupabase\(\{ auth: "publishable:cn_demo" \}/, "CN API must accept only its named publishable key.");
  requirePattern(cnFunction, /demo_credentials_immutable/, "CN API must enforce immutable preview credentials.");
  requirePattern(config, /"rcmi_demo"/, "RCMI schema must be explicitly listed for the Data API.");
  requirePattern(config, /^\[functions\.rcmi-api\]\r?\nverify_jwt = false$/m, "RCMI API must delegate modern publishable-key validation to the server wrapper.");
  requirePattern(rcmiMigration, /revoke all on schema rcmi_demo from public, anon, authenticated/i, "RCMI schema must deny browser roles by default.");
  requirePattern(rcmiMigration, /protect_default_password/i, "RCMI schema must protect its preview password.");
  requirePattern(rcmiMigration, /revoke all on function rcmi_demo\.reset_demo_data\(date\) from service_role/i, "RCMI reset handler must not be directly executable by API roles.");
  requirePattern(rcmiFunction, /withSupabase\(\{ auth: "publishable:rcmi_demo" \}/, "RCMI API must accept only its named publishable key.");
  requirePattern(rcmiFunction, /demo_password_immutable/, "RCMI API must reject password changes.");
  requirePattern(config, /"hours_demo"/, "Hours schema must be explicitly listed for the Data API.");
  requirePattern(config, /^\[functions\.hours-api\]\r?\nverify_jwt = false$/m, "Hours API must delegate modern publishable-key validation to the server wrapper.");
  requirePattern(hoursMigration, /revoke all on schema hours_demo from public, anon, authenticated/i, "Hours schema must deny browser roles by default.");
  requirePattern(hoursMigration, /protect_default_password/i, "Hours schema must protect its preview password.");
  requirePattern(hoursMigration, /revoke all on function hours_demo\.reset_demo_data\(date\) from service_role/i, "Hours reset handler must not be directly executable by API roles.");
  requirePattern(hoursFunction, /withSupabase\(\{ auth: "publishable:hours_demo" \}/, "Hours API must accept only its named publishable key.");
  requirePattern(hoursFunction, /demo_password_immutable/, "Hours API must reject password changes.");
  requirePattern(config, /"payroll_demo"/, "Payroll schema must be explicitly listed for the reset contract.");
  requirePattern(payrollMigration, /persists no visitor data/i, "Payroll reset handler must document its no-persistence design.");
  requirePattern(payrollMigration, /revoke all on all functions in schema payroll_demo from public, anon, authenticated, service_role/i, "Payroll reset handler must not be executable by API roles.");
  requirePattern(config, /"travels_demo"/, "Travels schema must be explicitly listed for the reset contract.");
  requirePattern(travelsMigration, /persists no visitor data/i, "Travels reset handler must document its no-persistence design.");
  requirePattern(travelsMigration, /revoke all on all functions in schema travels_demo from public, anon, authenticated, service_role/i, "Travels reset handler must not be executable by API roles.");

  const disabledSignupCount = (config.match(/^enable_signup = false$/gm) ?? []).length;
  if (disabledSignupCount < 3) {
    failures.push("General, email, and SMS signups must remain disabled by default.");
  }

  if (!seed.includes("fictional demo data only")) {
    failures.push("Seed policy marker is missing.");
  }

  if (
    !/^[a-z]{20}$/.test(project.projectRef) ||
    project.projectUrl !== "https://" + project.projectRef + ".supabase.co"
  ) {
    failures.push("Supabase project reference or URL metadata is invalid.");
  }
  if (
    project.name !== "portfolio-live-demos" ||
    project.plan !== "free" ||
    project.region !== "ap-southeast-1" ||
    project.database?.majorVersion !== 17
  ) {
    failures.push("Supabase project identity, plan, region, or Postgres metadata is unexpected.");
  }
  if (
    project.dashboardConfiguration?.dataApiEnabled !== true ||
    project.dashboardConfiguration?.automaticallyExposeNewTables !== false ||
    project.dashboardConfiguration?.automaticRls !== true
  ) {
    failures.push("Supabase dashboard security toggles do not match the approved baseline.");
  }
  if (project.dataPolicy !== "fictional-demo-data-only") {
    failures.push("Supabase remote data policy must remain fictional-demo-data-only.");
  }
  const expectedMigrationVersions = [
    "20260722000100",
    "20260722000200",
    "20260722000300",
    "20260722000400",
    "20260722000500",
    "20260722000600",
    "20260722000700",
    "20260722000800",
    "20260722000900",
    "20260722001000",
    "20260722001100",
    "20260726000100",
    "20260726000200",
    "20260726000300",
    "20260729000100",
    "20260729000200",
    "20260729000300",
    "20260730000100",
    "20260730000200",
    "20260808000100"
  ];
  if (
    !["4.4", "4.5"].includes(deployment.phase) ||
    deployment.supabase?.projectRef !== project.projectRef ||
    JSON.stringify(deployment.supabase?.migrationVersions) !== JSON.stringify(expectedMigrationVersions) ||
    deployment.supabase?.remoteMigrationHistoryVerified !== true ||
    deployment.supabase?.remoteLintErrorCount !== 0
  ) {
    failures.push("Phase 4.4+ Supabase deployment evidence is incomplete or targets an unexpected project.");
  }
  for (const appId of ["cn", "rcmi", "hours", "payroll", "travels"]) {
    const application = deployment.supabase?.applications?.[appId];
    if (application?.databaseResetReady !== true || application?.enabled !== true) {
      failures.push(`Phase 4.3 reset activation is incomplete for ${appId}.`);
    }
  }
  if (
    deployment.supabase?.cronInstalled !== true ||
    deployment.netlifySitesCreated !== true ||
    deployment.cloudflareSubdomainsConfigured !== (deployment.phase === "4.5") ||
    deployment.portfolioUpdated !== true
  ) {
    failures.push("Phase 4.4+ scheduler or later-hosting boundary is inconsistent.");
  }
  if (
    deployment.supabase?.vault?.projectUrlSecret !== "configured" ||
    deployment.supabase?.vault?.automationsKeySecret !== "configured" ||
    deployment.supabase?.resetScheduler?.installed !== true ||
    deployment.supabase?.resetScheduler?.jobName !== "portfolio-demo-reset-dispatch" ||
    deployment.supabase?.resetScheduler?.schedule !== "*/15 * * * *" ||
    deployment.supabase?.resetScheduler?.timezone !== "Asia/Manila" ||
    deployment.supabase?.resetScheduler?.latestRunStatus !== "succeeded"
  ) {
    failures.push("Phase 4.3 Vault or Cron evidence is incomplete.");
  }
  const resetVerification = deployment.supabase?.resetVerification;
  if (
    resetVerification?.completed !== true ||
    resetVerification?.allApplicationsSucceeded !== true ||
    resetVerification?.recoveryInvocation?.failed !== 0 ||
    resetVerification?.idempotentInvocation?.claimed !== 0 ||
    resetVerification?.dataApiSafeDeleteCompatibilityApplied !== true ||
    resetVerification?.postResetBaselines?.cnTeacherCount !== 4 ||
    resetVerification?.postResetBaselines?.rcmiMemberCount !== 16 ||
    resetVerification?.postResetBaselines?.hoursPasswordMutationRejected !== true
  ) {
    failures.push("Phase 4.3 reset idempotency or post-reset baseline evidence is incomplete.");
  }

  const expectedSchemas = ["public", "graphql_public", "cn_demo", "rcmi_demo", "hours_demo"];
  if (
    JSON.stringify(project.dashboardConfiguration?.exposedSchemas) !== JSON.stringify(expectedSchemas) ||
    project.dashboardConfiguration?.maxRows !== 500 ||
    JSON.stringify(deployment.supabase?.dataApi?.exposedSchemas) !== JSON.stringify(expectedSchemas) ||
    deployment.supabase?.dataApi?.maxRows !== 500 ||
    deployment.supabase?.dataApi?.browserRolesDirectAccessDenied !== true
  ) {
    failures.push("Phase 4.2 Data API exposure is incomplete or broader than the reviewed schemas.");
  }
  for (const [name, version] of [["reset-coordinator", 5], ["cn-api", 17], ["rcmi-api", 7], ["hours-api", 7]]) {
    const edgeFunction = deployment.supabase?.edgeFunctions?.[name];
    if (edgeFunction?.status !== "active" || edgeFunction?.version !== version || edgeFunction?.verifyJwt !== false) {
      failures.push(`Phase 4.2 function deployment evidence is incomplete for ${name}.`);
    }
  }
  for (const keyName of ["automations", "cn_demo", "rcmi_demo", "hours_demo"]) {
    if (deployment.supabase?.namedKeys?.[keyName] !== "configured") {
      failures.push(`Phase 4.2 named-key evidence is incomplete for ${keyName}.`);
    }
  }
  if (
    deployment.supabase?.liveVerification?.completed !== true ||
    deployment.supabase?.liveVerification?.crossKeyRejected !== true ||
    deployment.supabase?.liveVerification?.resetCoordinatorClaimed !== 0
  ) {
    failures.push("Phase 4.2 live security verification evidence is incomplete.");
  }

  try {
    const linkedProjectRef = (await readText("supabase/.temp/project-ref")).trim();
    if (linkedProjectRef !== project.projectRef) {
      failures.push("Local Supabase link points to an unexpected project.");
    }
  } catch {
    // The ignored local link is intentionally absent in CI and fresh clones.
  }

  if (failures.length > 0) {
    console.error("Supabase configuration audit failed with " + failures.length + " issue(s):");
    for (const failure of failures) {
      console.error(" - " + failure);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Supabase configuration audit passed.");
  console.log(" - CLI 2.109.1 is locked with registry integrity metadata.");
  console.log(" - Local auth, API, seed, and upload defaults are deny-by-default and bounded.");
  console.log(" - Reset control RPCs and the Edge coordinator are private, leased, and bounded.");
  console.log(" - Vault-backed Cron is active, idempotent, and live-verified for all five demos.");
  console.log(" - Remote target metadata records the dedicated Free Singapore demo project.");
}

main().catch((error) => {
  console.error("Supabase configuration audit could not complete: " + error.name + ".");
  process.exitCode = 1;
});
