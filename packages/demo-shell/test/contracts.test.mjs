import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DAILY_RESET_NOTICE,
  DEMO_CONTRACTS,
  getDemoContract,
  listDemoContracts,
  validateDemoContracts
} from "../src/contracts.js";
import {
  DEMO_DEPLOYMENT_NOTICE,
  GENERATED_SAMPLE_NOTICE,
  MONTHLY_DEMO_DATE_POLICY,
  PAYROLL_HOURS_BEHAVIOR,
  getPersistentDemoBaseline,
  validatePersistentDemoBaselines
} from "../src/baselines.js";
import {
  DEMO_NOTICE_HEIGHT_PROPERTY,
  ROBOTS_DIRECTIVE,
  applyDemoDocumentGuards,
  buildDemoNoticeModel,
  defineDemoNotice
} from "../src/demo-notice.js";

test("publishes a dynamic document-level notice height contract", async () => {
  const source = await readFile(new URL("../src/demo-notice.js", import.meta.url), "utf8");
  assert.equal(DEMO_NOTICE_HEIGHT_PROPERTY, "--portfolio-demo-notice-height");
  assert.match(source, /new ResizeObserverBase/);
  assert.match(source, /getBoundingClientRect/);
  assert.match(source, /style\?\.setProperty\?\.\(DEMO_NOTICE_HEIGHT_PROPERTY/);
  assert.match(source, /style\?\.removeProperty\?\.\(DEMO_NOTICE_HEIGHT_PROPERTY/);
});

test("defines exactly five unique, immutable preview contracts", () => {
  assert.deepEqual(validateDemoContracts(), { valid: true, count: 5 });
  assert.equal(listDemoContracts().length, 5);
  assert.equal(Object.isFrozen(DEMO_CONTRACTS), true);

  for (const contract of listDemoContracts()) {
    assert.equal(contract.preview.warning, DAILY_RESET_NOTICE);
    assert.equal(contract.preview.persistentNotice, true);
    assert.equal(contract.preview.noIndex, true);
    assert.equal(contract.preview.sampleDataNotice, GENERATED_SAMPLE_NOTICE);
    assert.equal(contract.preview.deploymentNotice, DEMO_DEPLOYMENT_NOTICE);
    assert.deepEqual(contract.preview.deployment, {
      frontend: "Netlify",
      backend: "Supabase",
      database: "Supabase"
    });
    assert.equal(contract.reset.timezone, "Asia/Manila");
    assert.equal(contract.reset.localTime, "00:00");
    assert.equal(Object.isFrozen(contract), true);
  }
});

test("locks the approved public demo credentials", () => {
  assert.deepEqual(
    getDemoContract("cn").credentials.map(({ audience, username, password, immutable }) => ({
      audience,
      username,
      password,
      immutable
    })),
    [
      { audience: "Administrator", username: "admin", password: "password", immutable: true },
      { audience: "Teacher", username: "testteacher", password: "password", immutable: true },
      { audience: "Student", username: "teststudent", password: "password", immutable: true }
    ]
  );
  assert.equal(getDemoContract("rcmi").credentials[0].password, "password");
  assert.equal(
    getDemoContract("rcmi").preview.navigationHint,
    "Administrator page: manually open /administrator in the address bar; it is not linked from the main page."
  );
  assert.equal(
    buildDemoNoticeModel("rcmi").navigationHint,
    "Administrator page: manually open /administrator in the address bar; it is not linked from the main page."
  );
  assert.equal(buildDemoNoticeModel("cn").navigationHint, null);
  assert.equal(getDemoContract("hours").credentials[0].password, "password");
  assert.equal(JSON.stringify(DEMO_CONTRACTS).includes("devpau"), false);
});

test("locks the persistent fictional CN baseline and restricted admin access", () => {
  assert.deepEqual(validatePersistentDemoBaselines(), { valid: true, projects: 2 });
  const cn = getPersistentDemoBaseline("cn");
  assert.equal(cn.generated, true);
  assert.equal(cn.accounts.administrator.username, "admin");
  assert.equal(cn.accounts.administrator.password, "password");
  assert.equal(cn.accounts.administrator.master, false);
  assert.equal(cn.noMasterAccountSeeded, true);
  assert.deepEqual(cn.reservedMasterUsernames, ["devpau"]);
  assert.equal(cn.teachers.length, 3);
  assert.equal(cn.students.length, 6);
  assert.ok(cn.schedules.length >= 7);
  assert.ok(cn.reports.length >= 2);
  assert.ok(cn.remainingClasses.transactions.length >= 4);
  assert.deepEqual(cn.accounts.administrator.hiddenRoutes, [
    "/remaining-classes/permissions",
    "/remaining-classes/devtools",
    "/security"
  ]);
  assert.deepEqual(cn.accounts.administrator.deniedCapabilities, [
    "admin-permissions.read",
    "admin-permissions.write",
    "developer-tools.use",
    "security-dashboard.read",
    "security-dashboard.write"
  ]);
  assert.equal(Object.isFrozen(cn), true);
});

test("publishes one Manila daily-progression policy for dated demo data", () => {
  assert.deepEqual(MONTHLY_DEMO_DATE_POLICY, {
    timezone: "Asia/Manila",
    rolloverLocalTime: "00:00",
    rolloverDay: 1,
    stableWithinMonth: false,
    progressesDaily: true,
    completedDateRule: "strictly-before-current-manila-date",
    projects: {
      cn: "monthly-schedules-with-completed-date-reports",
      rcmi: "directory-role-history-and-completed-date-attendance",
      hours: "completed-workday-session-entries"
    }
  });
  assert.equal(getPersistentDemoBaseline("cn").dateStrategy, "current-manila-month-with-completed-date-progression");
  assert.equal(getPersistentDemoBaseline("rcmi").dateStrategy, "current-manila-month-with-completed-date-progression");
  assert.equal(Object.isFrozen(MONTHLY_DEMO_DATE_POLICY.projects), true);
});

test("locks a small persistent fictional RCMI baseline", () => {
  const rcmi = getPersistentDemoBaseline("rcmi");
  assert.equal(rcmi.generated, true);
  assert.equal(rcmi.members.length, 8);
  assert.equal(rcmi.attendance.length, 10);
  assert.equal(rcmi.roleHistoryStrategy, "one-relative-baseline-row-per-member");
  assert.ok(rcmi.members.every((member) => member.displayName.startsWith("Preview ")));
  assert.throws(() => getPersistentDemoBaseline("unknown"), RangeError);
});

test("defers payroll dependent-hours synchronization until blur", () => {
  assert.deepEqual(PAYROLL_HOURS_BEHAVIOR, {
    synchronizationEvent: "blur",
    typingBehavior: "update-active-draft-only",
    derivedFieldRule: "derive-only-when-exactly-one-hours-field-is-empty",
    activeFieldProtection: "never-overwrite-focused-field",
    invalidInputBehavior: "do-not-derive-and-show-validation",
    appliesTo: ["total-hours", "every-person-hours-field"],
    monetaryInputBehavior: "unchanged"
  });
});

test("locks the CN upload limits", () => {
  assert.deepEqual(getDemoContract("cn").uploads, {
    enabled: true,
    private: true,
    maxFileBytes: 2 * 1024 * 1024,
    maxFilesPerReport: 5,
    maxFilesPerSessionPerDay: 20,
    maxTotalBytes: 100 * 1024 * 1024
  });
});

test("rejects unknown contract ids without reflecting them into markup", () => {
  assert.throws(() => getDemoContract("not-a-project"), RangeError);
  const model = buildDemoNoticeModel("<img src=x onerror=alert(1)>");
  assert.equal(model.projectId, "unknown");
  assert.equal(model.title, "Portfolio project - Portfolio preview");
  assert.equal(model.message, DAILY_RESET_NOTICE);
  assert.equal(model.sampleDataMessage, GENERATED_SAMPLE_NOTICE);
  assert.equal(model.deploymentMessage, DEMO_DEPLOYMENT_NOTICE);
  assert.equal(model.navigationHint, null);
});

test("installs an indexable robots guard without requiring a browser framework", () => {
  const appended = [];
  const head = {
    querySelector: () => null,
    append: (node) => appended.push(node)
  };
  const documentRef = {
    head,
    createElement: () => ({ name: "", content: "" })
  };

  assert.equal(applyDemoDocumentGuards(documentRef), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].name, "robots");
  assert.equal(appended[0].content, ROBOTS_DIRECTIVE);
  assert.equal(defineDemoNotice(undefined, undefined, undefined), false);
});

test("renderer source contains no unsafe HTML or dynamic-code sinks", async () => {
  const source = await readFile(new URL("../src/demo-notice.js", import.meta.url), "utf8");
  for (const forbiddenSink of [
    ".innerHTML",
    ".outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "eval("
  ]) {
    assert.equal(source.includes(forbiddenSink), false, "Found forbidden sink: " + forbiddenSink);
  }
});
