import { withSupabase } from "npm:@supabase/server@1.4.0";

const ALLOWED_ORIGINS = new Set([
  "https://rcmi-demo.pauuu.dev",
  "https://pauuu-rcmi-demo.netlify.app",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
]);
const DISTRICT_LEADERS = new Set(["pastor-sherwin", "ate-anj"]);
const ROLES = new Set(["leader", "member", "guest"]);
const DATE_KEY = /^\d{2}-\d{2}-\d{4}$/;
const SQL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_BYTES = 64 * 1024;

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
      : "https://rcmi-demo.pauuu.dev",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
  const marker = "/rcmi-api";
  const index = pathname.indexOf(marker);
  return (index >= 0 ? pathname.slice(index + marker.length) : pathname) || "/";
}

async function bodyJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    throw new ApiError(413, "request_too_large");
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_json");
  return body as Record<string, unknown>;
}

function normalizeName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 100) throw new ApiError(400, "invalid_name");
  return name;
}

function normalizeRole(value: unknown) {
  const role = String(value ?? "member").toLowerCase();
  if (!ROLES.has(role)) throw new ApiError(400, "invalid_role");
  return role;
}

function uuid(value: unknown) {
  const id = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, "invalid_member_id");
  }
  return id;
}

function toSqlDate(value: string) {
  if (!DATE_KEY.test(value)) throw new ApiError(400, "invalid_date");
  const [month, day, year] = value.split("-");
  const sql = `${year}-${month}-${day}`;
  const date = new Date(`${sql}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== sql) throw new ApiError(400, "invalid_date");
  return sql;
}

function fromSqlDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${month}-${day}-${year}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function many(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw new ApiError(503, "database_unavailable");
  return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

async function one(query: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await query;
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "duplicate_name");
    throw new ApiError(503, "database_unavailable");
  }
  return data as Record<string, unknown> | null;
}

function formatMember(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active !== false,
    createdAt: row.created_at,
    leaderId: row.leader_id ?? null,
    districtLeaderId: row.district_leader_id ?? null
  };
}

async function districtLeaders(database: any) {
  const rows = await many(database.from("app_settings").select("key,value").like("key", "district_leader.%"));
  const names = new Map(rows.map((row) => [String(row.key).replace("district_leader.", ""), String(row.value)]));
  return [
    { id: "pastor-sherwin", name: names.get("pastor-sherwin") ?? "Pastor Sherwin" },
    { id: "ate-anj", name: names.get("ate-anj") ?? "Ate Anj" }
  ];
}

async function limitMutation(request: Request, database: any, category: string) {
  const marker = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = await sha256(`${category}|${marker}`);
  const logicalDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const current = await one(database.from("mutation_rate_limits").select("logical_date,request_count").eq("rate_key", key).maybeSingle());
  const count = current?.logical_date === logicalDate ? Number(current.request_count) + 1 : 1;
  if (count > 200) throw new ApiError(429, "daily_mutation_limit");
  await database.from("mutation_rate_limits").upsert({ rate_key: key, logical_date: logicalDate, request_count: count, updated_at: new Date().toISOString() });
}

async function requireAdmin(request: Request, database: any) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 100) throw new ApiError(401, "unauthorized");
  const tokenHash = await sha256(token);
  const session = await one(database.from("admin_sessions").select("expires_at").eq("token_hash", tokenHash).maybeSingle());
  if (!session || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    if (session) await database.from("admin_sessions").delete().eq("token_hash", tokenHash);
    throw new ApiError(401, "unauthorized");
  }
  return tokenHash;
}

async function passwordValid(database: any, password: unknown) {
  if (typeof password !== "string" || password.length < 1 || password.length > 72) return false;
  const { data, error } = await database.rpc("verify_admin_password", { p_password: password });
  return !error && data === true;
}

async function authenticate(request: Request, database: any) {
  const body = await bodyJson(request);
  const marker = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = await sha256(marker);
  const rate = await one(database.from("login_rate_limits").select("failed_count,locked_until").eq("attempt_key", attemptKey).maybeSingle());
  if (rate?.locked_until && new Date(String(rate.locked_until)).getTime() > Date.now()) throw new ApiError(429, "login_temporarily_locked");
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
  await database.from("admin_sessions").insert({ token_hash: await sha256(token), expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() });
  return { ok: true, token };
}

async function memberRoutes(request: Request, database: any) {
  if (request.method === "GET") {
    const rows = await many(database.from("members").select("id,name,role,active,created_at,leader_id,district_leader_id").eq("active", true).order("name"));
    return { members: rows.map(formatMember) };
  }
  await limitMutation(request, database, "members");
  const body = await bodyJson(request);
  if (request.method === "POST") {
    const role = normalizeRole(body.role);
    const leaderId = role === "leader" ? null : uuid(body.leaderId);
    const districtLeaderId = role === "leader" && DISTRICT_LEADERS.has(String(body.districtLeaderId)) ? String(body.districtLeaderId) : null;
    if (role === "leader" && !districtLeaderId) throw new ApiError(400, "invalid_district_leader");
    const row = await one(database.from("members").insert({ name: normalizeName(body.name), role, leader_id: leaderId, district_leader_id: districtLeaderId }).select("*").single());
    if (!row) throw new ApiError(503, "database_unavailable");
    await database.from("member_role_history").insert({ member_id: row.id, role, leader_id: leaderId, effective_date: row.created_at });
    return { member: formatMember(row) };
  }
  if (request.method === "PATCH") {
    if (Array.isArray(body.ids)) {
      const ids = body.ids.slice(0, 100).map(uuid);
      if (ids.length === 0) throw new ApiError(400, "ids_required");
      const updates = body.districtLeaderId !== undefined
        ? { district_leader_id: DISTRICT_LEADERS.has(String(body.districtLeaderId)) ? body.districtLeaderId : null }
        : { leader_id: uuid(body.leaderId) };
      if (body.districtLeaderId !== undefined && !updates.district_leader_id) throw new ApiError(400, "invalid_district_leader");
      const { error } = await database.from("members").update({ ...updates, updated_at: new Date().toISOString() }).in("id", ids).eq("active", true);
      if (error) throw new ApiError(409, "invalid_assignment");
      return { updatedCount: ids.length, errors: [] };
    }
    const id = uuid(body.id);
    const role = normalizeRole(body.role);
    const leaderId = role === "leader" ? null : uuid(body.leaderId);
    const districtLeaderId = role === "leader" ? "pastor-sherwin" : null;
    const row = await one(database.from("members").update({ role, leader_id: leaderId, district_leader_id: districtLeaderId, updated_at: new Date().toISOString() }).eq("id", id).eq("active", true).select("*").single());
    if (!row) throw new ApiError(404, "member_not_found");
    await database.from("member_role_history").insert({ member_id: id, role, leader_id: leaderId, effective_date: new Date().toISOString().slice(0, 10) });
    return { member: formatMember(row) };
  }
  if (request.method === "DELETE") {
    const id = uuid(body.id);
    const assigned = await many(database.from("members").select("id").eq("leader_id", id).eq("active", true).limit(1));
    if (assigned.length) throw new ApiError(409, "leader_has_assignees");
    await database.from("members").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: true };
  }
  throw new ApiError(405, "method_not_allowed");
}

async function attendanceRoutes(request: Request, database: any) {
  const params = new URL(request.url).searchParams;
  if (request.method === "POST") {
    await limitMutation(request, database, "attendance");
    const body = await bodyJson(request);
    const date = toSqlDate(String(body.date ?? ""));
    const memberId = uuid(body.memberId);
    const member = await one(database.from("members").select("id").eq("id", memberId).eq("active", true).maybeSingle());
    if (!member) throw new ApiError(404, "member_not_found");
    if (body.status === "present") {
      await database.from("attendance").upsert({ attendance_date: date, member_id: memberId }, { onConflict: "attendance_date,member_id" });
    } else {
      await database.from("attendance").delete().eq("attendance_date", date).eq("member_id", memberId);
    }
    return { ok: true, status: body.status === "present" ? "present" : "absent" };
  }
  if (request.method !== "GET") throw new ApiError(405, "method_not_allowed");

  const mode = params.get("mode") ?? "editor";
  if (mode === "month" || mode === "month-hierarchical") {
    const month = params.get("month") ?? "";
    if (!/^\d{2}-\d{4}$/.test(month)) throw new ApiError(400, "invalid_month");
    const [monthNumber, year] = month.split("-").map(Number);
    const first = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const last = `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const rows = await many(database.from("attendance").select("attendance_date,member_id,members!inner(id,name,role,leader_id)").gte("attendance_date", first).lte("attendance_date", last));
    if (mode === "month-hierarchical") {
      return { rows: rows.map((row: any) => ({ attendanceDate: fromSqlDate(row.attendance_date), memberId: row.member_id, memberName: row.members.name, role: row.members.role, leaderId: row.members.leader_id, leaderName: null })) };
    }
    const days: Record<string, unknown[]> = {};
    for (const row of rows as any[]) {
      const key = fromSqlDate(row.attendance_date);
      (days[key] ??= []).push({ id: row.members.id, name: row.members.name, role: row.members.role, status: "present" });
    }
    return { days };
  }

  const date = toSqlDate(params.get("date") ?? "");
  const members = await many(database.from("members").select("id,name,role,leader_id").eq("active", true).order("name"));
  const present = await many(database.from("attendance").select("member_id").eq("attendance_date", date));
  const presentIds = new Set(present.map((row) => row.member_id));
  const attendance = members
    .filter((member) => mode !== "viewer" || presentIds.has(member.id))
    .map((member) => ({ id: member.id, name: member.name, role: member.role, leaderId: member.leader_id, leaderName: null, status: presentIds.has(member.id) ? "present" : "absent" }));
  return { attendance };
}

async function adminAttendance(request: Request, database: any) {
  await requireAdmin(request, database);
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 50)));
    const offset = Math.max(0, Number(params.get("offset") ?? 0));
    let query = database.from("attendance").select("attendance_date,member_id,created_at,members!inner(name,role)", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (params.get("date_from")) query = query.gte("attendance_date", toSqlDate(params.get("date_from")!));
    if (params.get("date_to")) query = query.lte("attendance_date", toSqlDate(params.get("date_to")!));
    const { data, error, count } = await query;
    if (error) throw new ApiError(503, "database_unavailable");
    return { records: (data ?? []).map((row: any) => ({ attendance_date: fromSqlDate(row.attendance_date), member_id: row.member_id, member_name: row.members.name, member_role: row.members.role, created_at: row.created_at })), total: count ?? 0 };
  }
  if (request.method === "DELETE") {
    const body = await bodyJson(request);
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 100) : [];
    for (const entry of ids) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      await database.from("attendance").delete().eq("attendance_date", toSqlDate(String(row.attendance_date ?? ""))).eq("member_id", uuid(row.member_id));
    }
    return { deleted: ids.length };
  }
  throw new ApiError(405, "method_not_allowed");
}

async function handle(request: Request, context: any) {
  const path = routePath(request);
  const database = context.supabaseAdmin.schema("rcmi_demo");
  if (path === "/members") return json(request, await memberRoutes(request, database), request.method === "POST" ? 201 : 200);
  if (path === "/settings" && request.method === "GET") return json(request, { districtLeaders: await districtLeaders(database) });
  if (path === "/attendance") return json(request, await attendanceRoutes(request, database));
  if (path === "/administrator-auth" && request.method === "POST") return json(request, await authenticate(request, database));
  if (path === "/attendance-export-verify" && request.method === "POST") {
    const body = await bodyJson(request);
    if (!(await passwordValid(database, body.password))) throw new ApiError(401, "incorrect_password");
    return json(request, { ok: true });
  }
  if (path === "/administrator-attendance") return json(request, await adminAttendance(request, database));
  if (path === "/administrator-settings") {
    await requireAdmin(request, database);
    if (request.method === "POST") throw new ApiError(403, "demo_password_immutable");
    if (request.method !== "PATCH") throw new ApiError(405, "method_not_allowed");
    const body = await bodyJson(request);
    const updates = Array.isArray(body.districtLeaders) ? body.districtLeaders.slice(0, 2) : [];
    for (const update of updates) {
      if (!update || typeof update !== "object") throw new ApiError(400, "invalid_setting");
      const item = update as Record<string, unknown>;
      const id = String(item.id ?? "");
      if (!DISTRICT_LEADERS.has(id)) throw new ApiError(400, "invalid_setting");
      await database.from("app_settings").update({ value: normalizeName(item.name), updated_at: new Date().toISOString() }).eq("key", `district_leader.${id}`).eq("protected", false);
    }
    return json(request, { districtLeaders: await districtLeaders(database) });
  }
  throw new ApiError(404, "not_found");
}

const authorized = withSupabase({ auth: "publishable:rcmi_demo" }, async (request, context) => {
  try {
    return await handle(request, context);
  } catch (error) {
    if (error instanceof ApiError) return json(request, { error: error.code }, error.status);
    console.error(JSON.stringify({ event: "rcmi_api_error", appId: "rcmi", category: "unexpected" }));
    return json(request, { error: "temporary_unavailable" }, 503);
  }
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const origin = request.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, { error: "origin_not_allowed" }, 403);
    return authorized(request);
  }
};
