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
  const [rootPackage, lockfile, project, config, seed] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readJson("config/supabase-project.json"),
    readText("supabase/config.toml"),
    readText("supabase/seed.sql")
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

  requirePattern(config, /^project_id = "portfolio-live-demos"$/m, "Local Supabase project id is unexpected.");
  requirePattern(config, /^major_version = 17$/m, "Local Postgres major version must be 17.");
  requirePattern(config, /^max_rows = 500$/m, "Data API row limit must remain bounded.");
  requirePattern(config, /^file_size_limit = "2MiB"$/m, "Global local storage upload limit must remain 2 MiB.");
  requirePattern(config, /^enable_anonymous_sign_ins = false$/m, "Anonymous authentication must remain disabled.");
  requirePattern(config, /^minimum_password_length = 8$/m, "Minimum authentication password length must remain eight.");
  requirePattern(config, /^sql_paths = \["\.\/seed\.sql"\]$/m, "Seed path must remain deterministic.");

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
  console.log(" - Remote target metadata records the dedicated Free Singapore demo project.");
}

main().catch((error) => {
  console.error("Supabase configuration audit could not complete: " + error.name + ".");
  process.exitCode = 1;
});
