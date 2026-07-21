import assert from "node:assert/strict";
import test from "node:test";

import {
  ResetCoordinatorError,
  STORAGE_DELETE_BATCH_SIZE,
  collectDisposableObjectPaths,
  cleanDisposableStorageBatch,
  normalizeDisposablePrefix,
  safeErrorCategory
} from "../functions/_shared/reset-storage.js";

function createStorageFixture(initialEntriesByDirectory) {
  const entriesByDirectory = new Map(
    Object.entries(initialEntriesByDirectory).map(([directory, entries]) => [
      directory,
      entries.map((entry) => ({ ...entry }))
    ])
  );
  const removedBatches = [];

  const client = {
    list: async (directory, options) => {
      const entries = entriesByDirectory.get(directory) ?? [];
      return {
        data: entries.slice(options.offset, options.offset + options.limit),
        error: null
      };
    },
    remove: async (paths) => {
      removedBatches.push([...paths]);
      for (const path of paths) {
        const separator = path.lastIndexOf("/");
        const directory = path.slice(0, separator);
        const name = path.slice(separator + 1);
        const entries = entriesByDirectory.get(directory) ?? [];
        entriesByDirectory.set(
          directory,
          entries.filter((entry) => !(entry.id !== null && entry.name === name))
        );
      }
      return { data: [], error: null };
    }
  };

  return {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "cn-private");
        return client;
      }
    },
    removedBatches
  };
}

test("walks nested private Storage paths without escaping the disposable prefix", async () => {
  const fixture = createStorageFixture({
    visitor: [
      { id: null, name: "report-a" },
      { id: "root-id", name: "root.txt" }
    ],
    "visitor/report-a": [
      { id: "nested-id", name: "attachment.pdf" }
    ]
  });

  assert.deepEqual(
    await collectDisposableObjectPaths(fixture.storage, "cn-private", "visitor"),
    ["visitor/root.txt", "visitor/report-a/attachment.pdf"]
  );
});

test("deletes at most one bounded batch and reports remaining work", async () => {
  const entries = Array.from({ length: STORAGE_DELETE_BATCH_SIZE + 1 }, (_, index) => ({
    id: "object-" + index,
    name: String(index).padStart(4, "0") + ".txt"
  }));
  const fixture = createStorageFixture({ visitor: entries });

  const result = await cleanDisposableStorageBatch(
    fixture.storage,
    "cn-private",
    "visitor"
  );

  assert.deepEqual(result, { deleted: STORAGE_DELETE_BATCH_SIZE, complete: false });
  assert.equal(fixture.removedBatches.length, 1);
  assert.equal(fixture.removedBatches[0].length, STORAGE_DELETE_BATCH_SIZE);
  assert.ok(fixture.removedBatches[0].every((path) => path.startsWith("visitor/")));
});

test("marks cleanup complete only after the disposable namespace is empty", async () => {
  const fixture = createStorageFixture({
    visitor: [{ id: "one", name: "one.txt" }]
  });

  assert.deepEqual(
    await cleanDisposableStorageBatch(fixture.storage, "cn-private", "visitor"),
    { deleted: 1, complete: true }
  );
  assert.deepEqual(
    await cleanDisposableStorageBatch(fixture.storage, "cn-private", "visitor"),
    { deleted: 0, complete: true }
  );
});

test("rejects unsafe prefixes, child paths, and delete limits", async () => {
  assert.throws(() => normalizeDisposablePrefix("../protected"), ResetCoordinatorError);

  const unsafeFixture = createStorageFixture({
    visitor: [{ id: "unsafe", name: "../protected.txt" }]
  });
  await assert.rejects(
    collectDisposableObjectPaths(unsafeFixture.storage, "cn-private", "visitor"),
    (error) => error.category === "storage_path_rejected"
  );
  await assert.rejects(
    collectDisposableObjectPaths(unsafeFixture.storage, "cn-private", "visitor", 1001),
    (error) => error.category === "storage_limit_rejected"
  );
});

test("returns only allowlisted error categories", () => {
  assert.equal(
    safeErrorCategory(new ResetCoordinatorError("storage_delete_failed")),
    "storage_delete_failed"
  );
  assert.equal(safeErrorCategory(new Error("database details")), "unexpected_reset_error");
});
