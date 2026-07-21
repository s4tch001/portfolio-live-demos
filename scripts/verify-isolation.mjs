import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..");
const failures = [];
const notices = [];

const normalizeRelativePath = (value) => value.split(path.sep).join("/");

async function readJson(relativePath) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function runGit(repositoryPath, args) {
  try {
    return execFileSync(
      "git",
      ["-c", "safe.directory=" + repositoryPath, "-C", repositoryPath, ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();
  } catch (error) {
    const operation = args.join(" ");
    failures.push("Unable to run Git operation " + operation + " for protected source " + repositoryPath + ".");
    return null;
  }
}

async function sha256(absolutePath) {
  const content = await readFile(absolutePath);
  return createHash("sha256").update(content).digest("hex");
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function verifyProtectedSources(baseline) {
  for (const source of baseline.sources) {
    const expected = source.git;
    const branch = runGit(source.path, ["branch", "--show-current"]);
    const head = runGit(source.path, ["rev-parse", "HEAD"]);
    const tree = runGit(source.path, ["rev-parse", "HEAD^{tree}"]);
    const statusText = runGit(source.path, ["status", "--porcelain=v1", "--untracked-files=all"]);
    const status = statusText === null || statusText === "" ? [] : statusText.split("\n");

    if (branch !== null && branch !== expected.branch) {
      failures.push("Protected source " + source.id + " is on a different branch.");
    }
    if (head !== null && head !== expected.head) {
      failures.push("Protected source " + source.id + " has a different HEAD commit.");
    }
    if (tree !== null && tree !== expected.tree) {
      failures.push("Protected source " + source.id + " has a different committed tree.");
    }
    if (statusText !== null && !arraysEqual(status, expected.status)) {
      failures.push("Protected source " + source.id + " has unexpected working-tree changes.");
    }

    for (const [relativePath, expectedHash] of Object.entries(source.safeChecksums)) {
      const absolutePath = path.join(source.path, ...relativePath.split("/"));
      try {
        const actualHash = await sha256(absolutePath);
        if (actualHash !== expectedHash) {
          failures.push("Protected source " + source.id + " changed at safe checksum path " + relativePath + ".");
        }
      } catch {
        failures.push("Protected source " + source.id + " is missing safe checksum path " + relativePath + ".");
      }
    }
  }
}

function isWithinWorkspace(absolutePath) {
  const relative = path.relative(workspaceRoot, absolutePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function compileRules(entries) {
  return entries.map((entry) => ({
    ...entry,
    expression: new RegExp(entry.pattern, entry.flags ?? "")
  }));
}

async function verifyWorkspace(policy, denylist) {
  const baselineById = new Map(
    (await readJson("docs/isolation/source-baseline.json")).sources.map((source) => [source.id, source])
  );
  const projectIds = new Set();

  for (const project of policy.projects) {
    if (projectIds.has(project.id)) {
      failures.push("Duplicate project id in source import policy: " + project.id + ".");
    }
    projectIds.add(project.id);

    const sourceBaseline = baselineById.get(project.id);
    if (!sourceBaseline || sourceBaseline.path !== project.sourceRoot) {
      failures.push("Source import policy does not match the recorded baseline for " + project.id + ".");
    }

    const targetPath = path.resolve(workspaceRoot, ...project.targetRoot.split("/"));
    if (!isWithinWorkspace(targetPath)) {
      failures.push("Import target escapes the live-demo workspace for " + project.id + ".");
      continue;
    }

    try {
      const targetStats = await lstat(targetPath);
      if (!targetStats.isDirectory()) {
        failures.push("Import target is not a directory for " + project.id + ".");
      }
    } catch {
      failures.push("Import target is missing for " + project.id + ".");
    }

    if (!Array.isArray(project.allow) || !Array.isArray(project.deny)) {
      failures.push("Import policy must contain allow and deny lists for " + project.id + ".");
    }
  }

  if (policy.defaultAction !== "deny" || !Array.isArray(policy.globalDeny) || policy.globalDeny.length === 0) {
    failures.push("Source import policy must remain deny-by-default.");
  }

  const ignoredDirectories = new Set(denylist.ignoredDirectories);
  const contentExclusions = new Set(denylist.contentScanExclusions);
  const allowedEnvironmentExamples = new Set(denylist.allowedEnvironmentExamples);
  const pathRules = compileRules(denylist.forbiddenPathRules);
  const contentRules = compileRules(denylist.forbiddenContentRules);
  const textExtensions = new Set(denylist.textExtensions.map((extension) => extension.toLowerCase()));
  let scannedFiles = 0;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(path.relative(workspaceRoot, absolutePath));

      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue;
      }

      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        try {
          const resolvedTarget = await realpath(absolutePath);
          if (!isWithinWorkspace(resolvedTarget)) {
            failures.push("Link escapes the live-demo workspace at " + relativePath + ".");
          }
        } catch {
          failures.push("Broken or unreadable link at " + relativePath + ".");
        }
        continue;
      }

      const isAllowedEnvironmentExample = allowedEnvironmentExamples.has(entry.name);
      for (const rule of pathRules) {
        rule.expression.lastIndex = 0;
        if (
          rule.expression.test(relativePath) &&
          !(rule.id === "environment-file" && isAllowedEnvironmentExample)
        ) {
          failures.push("Forbidden path rule " + rule.id + " matched " + relativePath + ".");
        }
      }

      if (stats.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      scannedFiles += 1;
      if (contentExclusions.has(relativePath)) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!textExtensions.has(extension) || stats.size > 2 * 1024 * 1024) {
        continue;
      }

      const content = await readFile(absolutePath, "utf8");
      for (const rule of contentRules) {
        rule.expression.lastIndex = 0;
        if (rule.expression.test(content)) {
          failures.push("Forbidden content rule " + rule.id + " matched " + relativePath + ".");
        }
      }
    }
  }

  await walk(workspaceRoot);
  notices.push("Scanned " + scannedFiles + " workspace files for forbidden paths and secret patterns.");
}

async function main() {
  const [baseline, policy, denylist] = await Promise.all([
    readJson("docs/isolation/source-baseline.json"),
    readJson("config/source-import-policy.json"),
    readJson("config/secret-denylist.json")
  ]);

  const workspaceOnly = process.argv.includes("--workspace-only");
  if (workspaceOnly) {
    notices.push("Workspace-only mode: local protected-source directories were not accessed.");
  } else {
    await verifyProtectedSources(baseline);
  }
  await verifyWorkspace(policy, denylist);

  if (failures.length > 0) {
    console.error("Isolation audit failed with " + failures.length + " issue(s):");
    for (const failure of failures) {
      console.error(" - " + failure);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Isolation audit passed.");
  if (!workspaceOnly) {
    console.log(" - " + baseline.sources.length + " protected repositories match the recorded baseline.");
  }
  for (const notice of notices) {
    console.log(" - " + notice);
  }
}

main().catch((error) => {
  console.error("Isolation audit could not complete: " + error.name + ".");
  process.exitCode = 1;
});
