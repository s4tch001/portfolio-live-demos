import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
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

function command(commandName, args) {
  try {
    return execFileSync(commandName, args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }).trim();
  } catch {
    return null;
  }
}

function majorVersion(version) {
  const match = /^v?(\d+)\./.exec(version ?? "");
  return match ? Number(match[1]) : null;
}

function supportedNodeMajor(version) {
  const major = majorVersion(version);
  return major !== null && major >= 24 && major < 27;
}

function installedNpmVersion() {
  const userAgentMatch = /(?:^|\s)npm\/([^\s]+)/.exec(process.env.npm_config_user_agent ?? "");
  if (userAgentMatch) {
    return userAgentMatch[1];
  }

  if (process.env.npm_execpath) {
    return command(process.execPath, [process.env.npm_execpath, "--version"]);
  }

  const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return command(process.execPath, [npmCliPath, "--version"]);
}

async function verifyWorkspacePackages(rootPackage) {
  const expectedLocations = [];

  for (const workspacePattern of rootPackage.workspaces) {
    if (!workspacePattern.endsWith("/*")) {
      failures.push("Unsupported workspace pattern " + workspacePattern + ".");
      continue;
    }

    const parent = workspacePattern.slice(0, -2);
    const parentPath = path.join(workspaceRoot, ...parent.split("/"));
    const entries = await readdir(parentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        expectedLocations.push(parent + "/" + entry.name);
      }
    }
  }

  const names = new Set();
  for (const location of expectedLocations.sort()) {
    let workspacePackage;
    try {
      workspacePackage = await readJson(location + "/package.json");
    } catch {
      failures.push("Workspace package manifest is missing or invalid at " + location + ".");
      continue;
    }

    if (workspacePackage.private !== true) {
      failures.push("Workspace package must remain private at " + location + ".");
    }
    if (!workspacePackage.name || names.has(workspacePackage.name)) {
      failures.push("Workspace package name is missing or duplicated at " + location + ".");
    }
    names.add(workspacePackage.name);
  }

  return expectedLocations.sort();
}

async function main() {
  const rootPackage = await readJson("package.json");
  const lockfile = await readJson("package-lock.json");
  const nvmVersion = (await readText(".nvmrc")).trim();
  const npmConfig = await readText(".npmrc");

  if (!supportedNodeMajor(process.version)) {
    failures.push("Node.js major version 24, 25, or 26 is required.");
  }

  const npmVersion = installedNpmVersion();
  if (![11, 12].includes(majorVersion(npmVersion))) {
    failures.push("npm major version 11 or 12 is required.");
  }

  if (nvmVersion !== "26") {
    failures.push(".nvmrc must select Node.js 26.");
  }
  if (rootPackage.packageManager !== "npm@11.11.0") {
    failures.push("packageManager must remain pinned to npm 11.11.0.");
  }
  if (rootPackage.engines?.node !== ">=24 <27" || rootPackage.engines?.npm !== ">=11 <13") {
    failures.push("package.json engine ranges do not match the supported toolchain.");
  }
  if (
    rootPackage.devEngines?.runtime?.onFail !== "error" ||
    rootPackage.devEngines?.packageManager?.onFail !== "error"
  ) {
    failures.push("Development engine mismatches must fail closed.");
  }
  if (!npmConfig.includes("engine-strict=true") || !npmConfig.includes("package-lock=true")) {
    failures.push(".npmrc must enforce engines and the npm lockfile.");
  }
  if (lockfile.lockfileVersion !== 3 || lockfile.packages?.[""]?.name !== rootPackage.name) {
    failures.push("package-lock.json is missing, stale, or uses an unexpected format.");
  }

  const workspaceLocations = await verifyWorkspacePackages(rootPackage);
  for (const location of workspaceLocations) {
    if (!Object.hasOwn(lockfile.packages ?? {}, location)) {
      failures.push("Lockfile is missing workspace " + location + ".");
    }
  }

  const gitBranch = command("git", ["branch", "--show-current"]);
  const inGitHubActions = process.env.GITHUB_ACTIONS === "true";
  if (inGitHubActions) {
    const repository = process.env.GITHUB_REPOSITORY;
    const ref = process.env.GITHUB_REF ?? "";
    const allowedRef = ref === "refs/heads/main" || /^refs\/pull\/\d+\/merge$/.test(ref);
    if (repository !== "s4tch001/portfolio-live-demos" || !allowedRef) {
      failures.push("GitHub Actions must run for the intended repository and an allowed main or pull-request ref.");
    }
  } else {
    const mainBranchExists = command("git", ["show-ref", "--verify", "--hash", "refs/heads/main"]) !== null;
    if (gitBranch !== "main" && !mainBranchExists) {
      failures.push("The local repository must have main as its initialized default branch.");
    }
  }

  const remoteUrl = command("git", ["remote", "get-url", "origin"]);
  const normalizedRemote = remoteUrl?.replace(/\.git$/, "");
  if (normalizedRemote !== "https://github.com/s4tch001/portfolio-live-demos") {
    failures.push("Git origin must point to the intended private repository without embedded credentials.");
  }

  if (failures.length > 0) {
    console.error("Toolchain audit failed with " + failures.length + " issue(s):");
    for (const failure of failures) {
      console.error(" - " + failure);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Toolchain audit passed.");
  console.log(" - Node.js " + process.version + " and npm " + npmVersion + " satisfy the supported majors.");
  console.log(" - " + workspaceLocations.length + " private workspaces are represented in the lockfile.");
  console.log(" - Git context and credential-free origin are configured.");
}

main().catch((error) => {
  console.error("Toolchain audit could not complete: " + error.name + ".");
  process.exitCode = 1;
});
