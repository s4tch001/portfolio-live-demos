import { withSupabase } from "npm:@supabase/server@1.4.0";

import {
  ResetCoordinatorError,
  cleanDisposableStorageBatch,
  safeErrorCategory
} from "../_shared/reset-storage.js";

const ALLOWED_APPS = new Set(["cn", "rcmi", "hours", "payroll", "travels"]);
const ALLOWED_STATES = new Set(["running", "db_cleared", "storage_pending", "succeeded"]);

type ResetClaim = {
  run_id: string;
  app_id: string;
  logical_date: string;
  reset_state: string;
  storage_bucket: string | null;
  disposable_prefix: string | null;
};

type ResetResult = {
  appId: string;
  outcome: "succeeded" | "pending" | "failed";
  deleted: number;
  errorCategory?: string;
};

function noStoreHeaders() {
  return {
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8"
  };
}

function validateUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateClaim(value: unknown): ResetClaim {
  if (!value || typeof value !== "object") {
    throw new ResetCoordinatorError("reset_claim_invalid");
  }

  const claim = value as Record<string, unknown>;
  const bucketPairIsValid =
    (claim.storage_bucket === null && claim.disposable_prefix === null) ||
    (typeof claim.storage_bucket === "string" && typeof claim.disposable_prefix === "string");

  if (
    !validateUuid(claim.run_id) ||
    typeof claim.app_id !== "string" ||
    !ALLOWED_APPS.has(claim.app_id) ||
    typeof claim.logical_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(claim.logical_date) ||
    typeof claim.reset_state !== "string" ||
    !ALLOWED_STATES.has(claim.reset_state) ||
    !bucketPairIsValid
  ) {
    throw new ResetCoordinatorError("reset_claim_invalid");
  }

  return claim as ResetClaim;
}

async function rpc(admin: any, functionName: string, parameters: Record<string, unknown>) {
  const result = await admin.rpc(functionName, parameters);
  if (result.error) {
    throw new ResetCoordinatorError("database_rpc_failed", { cause: result.error });
  }
  return result.data;
}

function firstRow(value: unknown) {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object") {
    throw new ResetCoordinatorError("database_result_invalid");
  }
  return value[0] as Record<string, unknown>;
}

async function markFailure(admin: any, claim: ResetClaim, workerId: string, category: string) {
  try {
    await rpc(admin, "mark_demo_reset_failed", {
      p_run_id: claim.run_id,
      p_worker_id: workerId,
      p_error_category: category
    });
  } catch {
    console.error(JSON.stringify({
      event: "demo_reset_failure_mark_failed",
      appId: claim.app_id,
      category: "failure_state_unavailable"
    }));
  }
}

async function processClaim(admin: any, rawClaim: unknown, workerId: string): Promise<ResetResult> {
  let claim: ResetClaim;
  try {
    claim = validateClaim(rawClaim);
  } catch (error) {
    return {
      appId: "unknown",
      outcome: "failed",
      deleted: 0,
      errorCategory: safeErrorCategory(error)
    };
  }

  try {
    let state = claim.reset_state;
    let bucket = claim.storage_bucket;
    let prefix = claim.disposable_prefix;

    if (state === "running") {
      const databaseResult = firstRow(await rpc(admin, "execute_demo_database_reset", {
        p_run_id: claim.run_id,
        p_worker_id: workerId
      }));
      state = String(databaseResult.reset_state ?? "");
      bucket = typeof databaseResult.storage_bucket === "string"
        ? databaseResult.storage_bucket
        : null;
      prefix = typeof databaseResult.disposable_prefix === "string"
        ? databaseResult.disposable_prefix
        : null;

      if (!ALLOWED_STATES.has(state)) {
        throw new ResetCoordinatorError("database_result_invalid");
      }
    }

    if (state === "succeeded") {
      return { appId: claim.app_id, outcome: "succeeded", deleted: 0 };
    }

    if (!bucket || !prefix || !["db_cleared", "storage_pending"].includes(state)) {
      throw new ResetCoordinatorError("storage_contract_invalid");
    }

    const cleanup = await cleanDisposableStorageBatch(admin.storage, bucket, prefix);
    if (cleanup.complete) {
      await rpc(admin, "mark_demo_storage_succeeded", {
        p_run_id: claim.run_id,
        p_worker_id: workerId
      });
      return { appId: claim.app_id, outcome: "succeeded", deleted: cleanup.deleted };
    }

    await rpc(admin, "mark_demo_storage_pending", {
      p_run_id: claim.run_id,
      p_worker_id: workerId
    });
    return { appId: claim.app_id, outcome: "pending", deleted: cleanup.deleted };
  } catch (error) {
    const category = safeErrorCategory(error);
    await markFailure(admin, claim, workerId, category);
    return {
      appId: claim.app_id,
      outcome: "failed",
      deleted: 0,
      errorCategory: category
    };
  }
}

export default {
  fetch: withSupabase({ auth: "secret:automations" }, async (request, context) => {
    if (request.method !== "POST") {
      return Response.json(
        { ok: false, error: "method_not_allowed" },
        { status: 405, headers: { ...noStoreHeaders(), allow: "POST" } }
      );
    }

    const workerId = crypto.randomUUID();
    let claims: unknown;
    try {
      claims = await rpc(context.supabaseAdmin, "claim_due_demo_resets", {
        p_worker_id: workerId
      });
    } catch {
      return Response.json(
        { ok: false, error: "reset_dispatch_unavailable" },
        { status: 503, headers: noStoreHeaders() }
      );
    }

    if (!Array.isArray(claims)) {
      return Response.json(
        { ok: false, error: "reset_dispatch_unavailable" },
        { status: 503, headers: noStoreHeaders() }
      );
    }

    const results = await Promise.all(
      claims.slice(0, 5).map((claim) => processClaim(context.supabaseAdmin, claim, workerId))
    );
    const summary = {
      ok: results.every((result) => result.outcome !== "failed"),
      claimed: results.length,
      succeeded: results.filter((result) => result.outcome === "succeeded").length,
      pending: results.filter((result) => result.outcome === "pending").length,
      failed: results.filter((result) => result.outcome === "failed").length
    };

    console.info(JSON.stringify({ event: "demo_reset_dispatch", ...summary }));
    return Response.json(summary, {
      status: summary.failed === 0 ? 200 : 503,
      headers: noStoreHeaders()
    });
  })
};
