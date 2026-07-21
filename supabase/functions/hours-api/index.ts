import { withSupabase } from "npm:@supabase/server@1.4.0";

const ALLOWED_ORIGINS = new Set([
  "https://hours-demo.pauuu.dev",
  "http://localhost:5175",
  "http://127.0.0.1:5175"
]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const MAX_BODY_BYTES = 8 * 1024;

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://hours-demo.pauuu.dev",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin"
  };
}

function json(request: Request, value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders(request) });
}

function routePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const marker = "/hours-api";
  const index = pathname.indexOf(marker);
  return (index >= 0 ? pathname.slice(index + marker.length) : pathname) || "/";
}

async function bodyJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    throw new ApiError(413, "request_too_large");
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_json");
  }
  return body as Record<string, unknown>;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function one(query: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await query;
  if (error) throw new ApiError(503, "database_unavailable");
  return data as Record<string, unknown> | null;
}

function clientMarker(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function logicalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function passwordValid(database: any, password: unknown) {
  if (typeof password !== "string" || password.length < 1 || password.length > 72) return false;
  const { data, error } = await database.rpc("verify_password", { p_password: password });
  return !error && data === true;
}

async function authenticate(request: Request, database: any) {
  const body = await bodyJson(request);
  const attemptKey = await sha256(clientMarker(request));
  const rate = await one(
    database.from("login_rate_limits")
      .select("failed_count,locked_until")
      .eq("attempt_key", attemptKey)
      .maybeSingle()
  );
  if (rate?.locked_until && new Date(String(rate.locked_until)).getTime() > Date.now()) {
    throw new ApiError(429, "login_temporarily_locked");
  }
  if (!(await passwordValid(database, body.password))) {
    const failures = Math.min(20, Number(rate?.failed_count ?? 0) + 1);
    await database.from("login_rate_limits").upsert({
      attempt_key: attemptKey,
      failed_count: failures,
      locked_until: failures >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    });
    throw new ApiError(401, "incorrect_password");
  }
  await database.from("login_rate_limits").delete().eq("attempt_key", attemptKey);
  const token = randomToken();
  await database.from("sessions").insert({
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  });
  return { token };
}

async function requireSession(request: Request, database: any) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 100) throw new ApiError(401, "unauthorized");
  const tokenHash = await sha256(token);
  const session = await one(
    database.from("sessions").select("expires_at").eq("token_hash", tokenHash).maybeSingle()
  );
  if (!session || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    if (session) await database.from("sessions").delete().eq("token_hash", tokenHash);
    throw new ApiError(401, "unauthorized");
  }
  return tokenHash;
}

async function limitMutation(database: any, sessionHash: string) {
  const rateKey = await sha256(`entries|${sessionHash}`);
  const date = logicalDate();
  const current = await one(
    database.from("mutation_rate_limits")
      .select("logical_date,request_count")
      .eq("rate_key", rateKey)
      .maybeSingle()
  );
  const count = current?.logical_date === date ? Number(current.request_count) + 1 : 1;
  if (count > 200) throw new ApiError(429, "daily_mutation_limit");
  await database.from("mutation_rate_limits").upsert({
    rate_key: rateKey,
    logical_date: date,
    request_count: count,
    updated_at: new Date().toISOString()
  });
}

function validDate(value: string) {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validMonth(value: string) {
  if (!MONTH_KEY.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function normalizeHours(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 48) {
    throw new ApiError(400, "invalid_hours_list");
  }
  const hours = value.map(Number);
  if (hours.some((entry) => !Number.isFinite(entry) || entry <= 0 || entry > 24)) {
    throw new ApiError(400, "invalid_hours_list");
  }
  if (hours.reduce((sum, entry) => sum + entry, 0) > 24) {
    throw new ApiError(400, "daily_hours_exceeded");
  }
  return hours.map((entry) => Math.round(entry * 100) / 100);
}

async function entries(request: Request, database: any, path: string) {
  const sessionHash = await requireSession(request, database);
  if (request.method === "GET" && path === "/entries") {
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!validMonth(month)) throw new ApiError(400, "invalid_month");
    const first = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;
    const { data, error } = await database.from("entries")
      .select("date_key,hours_list")
      .eq("session_hash", sessionHash)
      .gte("date_key", first)
      .lte("date_key", last)
      .order("date_key");
    if (error) throw new ApiError(503, "database_unavailable");
    return {
      entries: (data ?? []).map((row: any) => ({
        dateKey: row.date_key,
        hoursList: row.hours_list.map(Number)
      }))
    };
  }

  const dateKey = decodeURIComponent(path.slice("/entries/".length));
  if (!path.startsWith("/entries/") || !validDate(dateKey)) {
    throw new ApiError(400, "invalid_date");
  }
  await limitMutation(database, sessionHash);
  if (request.method === "PUT") {
    const body = await bodyJson(request);
    const { error } = await database.from("entries").upsert({
      session_hash: sessionHash,
      date_key: dateKey,
      hours_list: normalizeHours(body.hoursList),
      updated_at: new Date().toISOString()
    }, { onConflict: "session_hash,date_key" });
    if (error) throw new ApiError(503, "database_unavailable");
    return { ok: true };
  }
  if (request.method === "DELETE") {
    const { error } = await database.from("entries")
      .delete()
      .eq("session_hash", sessionHash)
      .eq("date_key", dateKey);
    if (error) throw new ApiError(503, "database_unavailable");
    return { ok: true };
  }
  throw new ApiError(405, "method_not_allowed");
}

async function handle(request: Request, context: any) {
  const path = routePath(request);
  const database = context.supabaseAdmin.schema("hours_demo");
  if (path === "/session" && request.method === "POST") {
    return json(request, await authenticate(request, database));
  }
  if (path === "/password" && request.method !== "GET") {
    throw new ApiError(403, "demo_password_immutable");
  }
  if (path === "/entries" || path.startsWith("/entries/")) {
    return json(request, await entries(request, database, path));
  }
  throw new ApiError(404, "not_found");
}

const authorized = withSupabase({ auth: "publishable:hours" }, async (request, context) => {
  try {
    return await handle(request, context);
  } catch (error) {
    if (error instanceof ApiError) return json(request, { error: error.code }, error.status);
    console.error(JSON.stringify({ event: "hours_api_error", appId: "hours", category: "unexpected" }));
    return json(request, { error: "temporary_unavailable" }, 503);
  }
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const origin = request.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(request, { error: "origin_not_allowed" }, 403);
    }
    return authorized(request);
  }
};
