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
  ROBOTS_DIRECTIVE,
  applyDemoDocumentGuards,
  buildDemoNoticeModel,
  defineDemoNotice
} from "../src/demo-notice.js";

test("defines exactly five unique, immutable preview contracts", () => {
  assert.deepEqual(validateDemoContracts(), { valid: true, count: 5 });
  assert.equal(listDemoContracts().length, 5);
  assert.equal(Object.isFrozen(DEMO_CONTRACTS), true);

  for (const contract of listDemoContracts()) {
    assert.equal(contract.preview.warning, DAILY_RESET_NOTICE);
    assert.equal(contract.preview.persistentNotice, true);
    assert.equal(contract.preview.noIndex, true);
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
      { audience: "Administrator", username: "devpau", password: "password", immutable: true },
      { audience: "Teacher", username: "testteacher", password: "password", immutable: true },
      { audience: "Student", username: "teststudent", password: "password", immutable: true }
    ]
  );
  assert.equal(getDemoContract("rcmi").credentials[0].password, "password");
  assert.equal(getDemoContract("hours").credentials[0].password, "password");
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
});

test("installs a noindex robots guard without requiring a browser framework", () => {
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
