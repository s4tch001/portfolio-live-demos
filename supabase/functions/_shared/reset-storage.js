export const STORAGE_LIST_PAGE_SIZE = 100;
export const STORAGE_DELETE_BATCH_SIZE = 500;
export const STORAGE_MAX_DIRECTORIES_PER_RUN = 200;

export class ResetCoordinatorError extends Error {
  constructor(category, options = undefined) {
    super(category, options);
    this.name = "ResetCoordinatorError";
    this.category = category;
  }
}

function assertStorageSegment(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ResetCoordinatorError("storage_path_rejected");
  }
  return value;
}

export function normalizeDisposablePrefix(value) {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value)
  ) {
    throw new ResetCoordinatorError("storage_prefix_rejected");
  }
  return value;
}

function childPath(parent, child) {
  return parent + "/" + assertStorageSegment(child);
}

function requireStorageResult(result, category) {
  if (!result || result.error || !Array.isArray(result.data)) {
    throw new ResetCoordinatorError(category, { cause: result?.error });
  }
  return result.data;
}

export async function collectDisposableObjectPaths(
  storage,
  bucket,
  disposablePrefix,
  maximumPaths = STORAGE_DELETE_BATCH_SIZE
) {
  if (!storage || typeof storage.from !== "function") {
    throw new ResetCoordinatorError("storage_client_invalid");
  }
  if (
    typeof bucket !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
  ) {
    throw new ResetCoordinatorError("storage_bucket_rejected");
  }
  if (!Number.isInteger(maximumPaths) || maximumPaths < 1 || maximumPaths > 1000) {
    throw new ResetCoordinatorError("storage_limit_rejected");
  }

  const root = normalizeDisposablePrefix(disposablePrefix);
  const bucketClient = storage.from(bucket);
  const directories = [root];
  const objectPaths = [];
  let directoryIndex = 0;

  while (directoryIndex < directories.length && objectPaths.length < maximumPaths) {
    if (directories.length > STORAGE_MAX_DIRECTORIES_PER_RUN) {
      throw new ResetCoordinatorError("storage_directory_limit");
    }

    const directory = directories[directoryIndex];
    directoryIndex += 1;
    let offset = 0;

    while (objectPaths.length < maximumPaths) {
      const page = requireStorageResult(
        await bucketClient.list(directory, {
          limit: STORAGE_LIST_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" }
        }),
        "storage_list_failed"
      );

      for (const item of page) {
        if (!item || typeof item.name !== "string") {
          throw new ResetCoordinatorError("storage_item_invalid");
        }
        const path = childPath(directory, item.name);
        if (item.id === null) {
          directories.push(path);
        } else if (typeof item.id === "string" && item.id.length > 0) {
          objectPaths.push(path);
          if (objectPaths.length === maximumPaths) {
            break;
          }
        } else {
          throw new ResetCoordinatorError("storage_item_invalid");
        }
      }

      if (page.length < STORAGE_LIST_PAGE_SIZE) {
        break;
      }
      offset += STORAGE_LIST_PAGE_SIZE;
    }
  }

  return objectPaths;
}

export async function cleanDisposableStorageBatch(storage, bucket, disposablePrefix) {
  const objectPaths = await collectDisposableObjectPaths(
    storage,
    bucket,
    disposablePrefix,
    STORAGE_DELETE_BATCH_SIZE
  );

  if (objectPaths.length === 0) {
    return Object.freeze({ deleted: 0, complete: true });
  }

  const removal = await storage.from(bucket).remove(objectPaths);
  if (!removal || removal.error) {
    throw new ResetCoordinatorError("storage_delete_failed", { cause: removal?.error });
  }

  const remaining = await collectDisposableObjectPaths(storage, bucket, disposablePrefix, 1);
  return Object.freeze({
    deleted: objectPaths.length,
    complete: remaining.length === 0
  });
}

export function safeErrorCategory(error) {
  if (
    error instanceof ResetCoordinatorError &&
    /^[a-z0-9_]{1,48}$/.test(error.category)
  ) {
    return error.category;
  }
  return "unexpected_reset_error";
}
