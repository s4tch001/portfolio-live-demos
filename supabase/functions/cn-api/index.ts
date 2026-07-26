import { withSupabase } from "npm:@supabase/server@1.4.0";

const APP_ID = "cn";
const ALLOWED_ORIGINS = new Set([
  "https://cn-demo.pauuu.dev",
  "https://pauuu-cn-demo.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);
const USERNAME = /^[a-z0-9._-]{3,40}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Map([
  ["image/webp", "webp"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"]
]);

type DemoUser = {
  id: number;
  username: string;
  fullname: string;
  role: "admin" | "teacher" | "student";
  language: string;
};

type Session = {
  user: DemoUser;
  tokenHash: string;
};

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
      : "https://cn-demo.pauuu.dev",
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
  const marker = "/cn-api";
  const markerIndex = pathname.indexOf(marker);
  const path = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname;
  return path || "/";
}

function requiredString(value: unknown, field: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength) {
    throw new ApiError(400, `invalid_${field}`);
  }
  return normalized;
}

function optionalString(value: unknown, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) throw new ApiError(400, "invalid_input");
  return normalized;
}

function searchToken(value: string) {
  return value.replace(/[^\p{L}\p{N} ._@/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function positiveId(value: unknown, field = "id") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new ApiError(400, `invalid_${field}`);
  return number;
}

function numericIdFromPath(path: string, prefix: string) {
  const match = path.match(new RegExp(`^/${prefix}/(\\d+)$`));
  return match ? positiveId(match[1]) : null;
}

async function bodyJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JSON_BYTES) throw new ApiError(413, "request_too_large");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_json");
  }
  return body as Record<string, unknown>;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function publicAccount(row: Record<string, unknown>, role?: DemoUser["role"]) {
  const result: Record<string, unknown> = {
    id: row.id,
    username: row.username,
    fullname: row.fullname ?? row.name,
    name: row.name,
    notes: row.notes,
    teacher_id: row.teacher_id,
    color: row.color,
    status: row.status,
    language: row.language,
    protected: row.protected
  };
  if (role) result.role = role;
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}

async function queryOne(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw new ApiError(503, "database_unavailable");
  return data as Record<string, unknown> | null;
}

async function queryMany(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw new ApiError(503, "database_unavailable");
  return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

async function writeLog(
  database: any,
  session: Session | null,
  request: Request,
  action: string,
  status = 200,
  details: Record<string, unknown> = {}
) {
  const path = routePath(request);
  try {
    await database.from("activity_logs").insert({
      actor_role: session?.user.role ?? "public",
      actor_id: session?.user.id ?? null,
      actor_name: session?.user.fullname ?? "",
      method: request.method,
      path,
      action,
      status,
      details: JSON.stringify({ ok: status < 400, body: details })
    });
  } catch (_) {
    // Logging is useful in the preview, but it must never break the demo flow.
  }
}

async function requireSession(request: Request, database: any): Promise<Session> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 100) throw new ApiError(401, "unauthorized");
  const tokenHash = await sha256(token);
  const session = await queryOne(
    database.from("sessions").select("token_hash,role,user_id,expires_at").eq("token_hash", tokenHash).maybeSingle()
  );
  if (!session || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    if (session) await database.from("sessions").delete().eq("token_hash", tokenHash);
    throw new ApiError(401, "unauthorized");
  }

  const role = String(session.role) as DemoUser["role"];
  const table = role === "admin" ? "admins" : role === "teacher" ? "teachers" : "students";
  const accountColumns = role === "student"
    ? "id,username,name,status,language"
    : "id,username,fullname,status,language";
  const account = await queryOne(
    database.from(table).select(accountColumns).eq("id", session.user_id).maybeSingle()
  );
  if (!account || account.status !== "Active") throw new ApiError(401, "unauthorized");
  return {
    tokenHash,
    user: {
      id: Number(account.id),
      username: String(account.username),
      fullname: String(account.fullname ?? account.name),
      role,
      language: String(account.language ?? "en")
    }
  };
}

function requireRole(session: Session, role: DemoUser["role"]) {
  if (session.user.role !== role) throw new ApiError(403, "forbidden");
}

function requireStaff(session: Session) {
  if (!new Set(["admin", "teacher"]).has(session.user.role)) throw new ApiError(403, "forbidden");
}

async function login(request: Request, database: any) {
  const body = await bodyJson(request);
  const username = requiredString(body.username, "username", 40).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!USERNAME.test(username) || password.length < 1 || password.length > 72) {
    throw new ApiError(401, "invalid_credentials");
  }

  const clientMarker = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = (await sha256(`${username}|${clientMarker}`)).slice(0, 64);
  const rate = await queryOne(database.from("login_rate_limits").select("failed_count,locked_until").eq("attempt_key", attemptKey).maybeSingle());
  if (rate?.locked_until && new Date(String(rate.locked_until)).getTime() > Date.now()) {
    throw new ApiError(429, "login_temporarily_locked");
  }

  let account: Record<string, unknown> | null = null;
  let role: DemoUser["role"] | null = null;
  for (const candidate of ["admin", "teacher", "student"] as const) {
    const table = candidate === "admin" ? "admins" : candidate === "teacher" ? "teachers" : "students";
    const accountColumns = candidate === "student"
      ? "id,username,password_hash,name,status,language"
      : "id,username,password_hash,fullname,status,language";
    account = await queryOne(database.from(table).select(accountColumns).eq("username", username).maybeSingle());
    if (account) {
      role = candidate;
      break;
    }
  }

  let valid = false;
  if (account && role && account.status === "Active") {
    const { data, error } = await database.rpc("verify_password", {
      p_password: password,
      p_password_hash: account.password_hash
    });
    valid = !error && data === true;
  }

  if (!valid || !account || !role) {
    const failures = Math.min(20, Number(rate?.failed_count ?? 0) + 1);
    const lockedUntil = failures >= 8 ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null;
    await database.from("login_rate_limits").upsert({
      attempt_key: attemptKey,
      failed_count: failures,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString()
    });
    throw new ApiError(401, "invalid_credentials");
  }

  await database.from("login_rate_limits").delete().eq("attempt_key", attemptKey);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const remember = body.remember_me === true;
  const expiresAt = new Date(Date.now() + (remember ? 7 * 24 : 2) * 60 * 60 * 1000).toISOString();
  const { error } = await database.from("sessions").insert({
    token_hash: tokenHash,
    role,
    user_id: account.id,
    expires_at: expiresAt
  });
  if (error) throw new ApiError(503, "login_unavailable");
  const result = {
    token,
    expires_at: expiresAt,
    user: publicAccount(account, role)
  };
  await writeLog(database, { tokenHash, user: result.user as DemoUser }, request, "Signed in", 200);
  return result;
}

async function hashPassword(database: any, password: unknown) {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    throw new ApiError(400, "invalid_password");
  }
  const { data, error } = await database.rpc("hash_password", { p_password: password });
  if (error || typeof data !== "string") throw new ApiError(503, "password_unavailable");
  return data;
}

async function accountRoutes(request: Request, path: string, database: any, session: Session) {
  const groups = [
    { path: "admins", role: "admin", nameField: "fullname" },
    { path: "teachers", role: "teacher", nameField: "fullname" },
    { path: "students", role: "student", nameField: "name" }
  ] as const;
  const group = groups.find((entry) => path === `/${entry.path}` || path.startsWith(`/${entry.path}/`));
  if (!group) return null;
  const id = numericIdFromPath(path, group.path);

  if (request.method === "GET") {
    if (group.path === "admins") requireRole(session, "admin");
    let query = database.from(group.path).select(group.path === "admins"
      ? "id,username,fullname,status,language,protected"
      : group.path === "teachers"
        ? "id,username,fullname,color,status,language,protected"
        : "id,name,notes,teacher_id,status,username,language,protected");
    if (id) query = query.eq("id", id);
    const search = new URL(request.url).searchParams.get("search")?.trim();
    if (search && group.path === "students") query = query.ilike("name", `%${search.replaceAll("%", "")}%`);
    if (group.path === "students" && session.user.role === "student") query = query.eq("id", session.user.id);
    const rows = await queryMany(query.order("id"));
    return id ? rows[0] ?? null : rows;
  }

  requireRole(session, "admin");
  const body = await bodyJson(request);
  if (request.method === "DELETE" && id) {
    const row = await queryOne(database.from(group.path).select("protected").eq("id", id).maybeSingle());
    if (!row) throw new ApiError(404, "not_found");
    if (row.protected) throw new ApiError(403, "demo_credentials_immutable");
    const { error } = await database.from(group.path).delete().eq("id", id);
    if (error) throw new ApiError(409, "account_in_use");
    return { ok: true };
  }

  if (!["POST", "PUT"].includes(request.method) || (request.method === "PUT" && !id)) {
    throw new ApiError(405, "method_not_allowed");
  }

  const existing = id
    ? await queryOne(database.from(group.path).select("protected,username").eq("id", id).maybeSingle())
    : null;
  if (id && !existing) throw new ApiError(404, "not_found");
  if (existing?.protected && body.password !== undefined) {
    throw new ApiError(403, "demo_credentials_immutable");
  }

  const values: Record<string, unknown> = {};
  if (!id || body[group.nameField] !== undefined) values[group.nameField] = requiredString(body[group.nameField], group.nameField, 100);
  if (body.status !== undefined) {
    const statuses = group.path === "students"
      ? new Set(["Active", "Inactive", "End of Contract"])
      : new Set(["Active", "Inactive"]);
    values.status = statuses.has(String(body.status)) ? body.status : "Active";
    if (group.path === "admins" && existing?.protected && values.status !== "Active") {
      throw new ApiError(403, "protected_demo_admin_must_stay_active");
    }
  }
  if (body.username !== undefined) {
    const username = requiredString(body.username, "username", 40).toLowerCase();
    if (!USERNAME.test(username) || username === "devpau") throw new ApiError(409, "reserved_username");
    if (existing?.protected && username !== existing.username) {
      throw new ApiError(403, "demo_credentials_immutable");
    }
    values.username = username;
  }
  if (!id && group.path !== "students" && values.username === undefined) throw new ApiError(400, "invalid_username");
  if (body.password !== undefined) values.password_hash = await hashPassword(database, body.password);
  if (!id && group.path !== "students" && values.password_hash === undefined) throw new ApiError(400, "invalid_password");
  if (group.path === "teachers" && body.color !== undefined) {
    const color = String(body.color);
    if (!COLOR.test(color)) throw new ApiError(400, "invalid_color");
    values.color = color;
  }
  if (group.path === "students") {
    if (body.notes !== undefined) values.notes = optionalString(body.notes, 1000);
    if (body.teacher_id !== undefined) values.teacher_id = body.teacher_id ? positiveId(body.teacher_id, "teacher_id") : null;
    if (!id && body.username === undefined) {
      values.username = null;
      values.password_hash = null;
    } else if (!id && values.password_hash === undefined) {
      throw new ApiError(400, "invalid_password");
    }
  }

  const mutation = id
    ? database.from(group.path).update(values).eq("id", id)
    : database.from(group.path).insert(values);
  const columns = group.path === "admins"
    ? "id,username,fullname,status,language,protected"
    : group.path === "teachers"
      ? "id,username,fullname,color,status,language,protected"
      : "id,name,notes,teacher_id,status,username,language,protected";
  const row = await queryOne(mutation.select(columns).single());
  await writeLog(database, session, request, `${id ? "Updated" : "Created"} ${group.role} account`, 200, {
    account_id: row?.id,
    username: row?.username,
    status: row?.status
  });
  return row;
}

function scheduleValues(body: Record<string, unknown>) {
  const date = requiredString(body.date, "date", 10);
  if (!DATE.test(date)) throw new ApiError(400, "invalid_date");
  const studentId = body.student_id ? positiveId(body.student_id, "student_id") : null;
  return {
    teacher_id: positiveId(body.teacher_id, "teacher_id"),
    date,
    timeslot: requiredString(body.timeslot, "timeslot", 40),
    student: requiredString(body.student, "student", 300),
    student_id: studentId,
    student_ids: studentId ? [studentId] : [],
    note: optionalString(body.note, 1000),
    trial: body.trial === true || body.trial === 1
  };
}

async function scheduleRoutes(request: Request, path: string, database: any, session: Session) {
  if (path === "/schedules" && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    let query = database.from("schedules").select("*").order("date").order("timeslot");
    if (params.get("start")) query = query.gte("date", params.get("start"));
    if (params.get("end")) query = query.lte("date", params.get("end"));
    if (session.user.role === "teacher") query = query.eq("teacher_id", session.user.id);
    if (session.user.role === "student") query = query.contains("student_ids", [session.user.id]);
    return await queryMany(query);
  }
  const id = numericIdFromPath(path, "schedules");
  const cancel = path.match(/^\/schedules\/(\d+)\/cancel$/);
  requireStaff(session);
  if (path === "/schedules" && request.method === "POST") {
    const row = await queryOne(database.from("schedules").insert(scheduleValues(await bodyJson(request))).select("*").single());
    return row;
  }
  if (id && request.method === "PUT") {
    const row = await queryOne(database.from("schedules").update(scheduleValues(await bodyJson(request))).eq("id", id).select("*").single());
    return row;
  }
  if (id && request.method === "DELETE") {
    const { error } = await database.from("schedules").delete().eq("id", id);
    if (error) throw new ApiError(409, "schedule_in_use");
    return { ok: true };
  }
  if (cancel && request.method === "POST") {
    const body = await bodyJson(request);
    const reason = requiredString(body.reason, "reason", 500);
    const scheduleId = positiveId(cancel[1]);
    const row = await queryOne(database.from("schedules").update({ cancelled: true, cancel_reason: reason }).eq("id", scheduleId).select("*").single());
    await refundScheduleUsage(database, scheduleId);
    await writeLog(database, session, request, "Cancelled class", 200, { schedule_id: scheduleId, reason });
    return row;
  }
  if (path === "/schedules/bulk-copy") throw new ApiError(501, "bulk_copy_unavailable_in_demo");
  return null;
}

function reportValues(body: Record<string, unknown>) {
  const date = requiredString(body.date, "date", 10);
  if (!DATE.test(date)) throw new ApiError(400, "invalid_date");
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  if (images.some((value) => typeof value !== "string" || value.length > 2000)) throw new ApiError(400, "invalid_images");
  return {
    schedule_id: positiveId(body.schedule_id, "schedule_id"),
    teacher_id: positiveId(body.teacher_id, "teacher_id"),
    content: optionalString(body.content, 10000),
    absent: body.absent === true || body.absent === 1,
    images,
    date,
    link: optionalString(body.link, 1000),
    book: optionalString(body.book, 200),
    pages: optionalString(body.pages, 100),
    class_duration: optionalString(body.class_duration, 100),
    absent_reason: optionalString(body.absent_reason, 200),
    absent_other: optionalString(body.absent_other, 500),
    tracker_remarks: optionalString(body.tracker_remarks, 2000),
    submitted_at: new Date().toISOString()
  };
}

async function studentScheduleIds(database: any, studentId: number, start?: string | null, end?: string | null) {
  let query = database.from("schedules").select("id").contains("student_ids", [studentId]);
  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);
  return (await queryMany(query)).map((row) => Number(row.id)).filter(Boolean);
}

async function refundScheduleUsage(database: any, scheduleId: number) {
  const usage = await queryMany(database.from("class_usage").select("id,transaction_id").eq("schedule_id", scheduleId));
  for (const row of usage) {
    const transactionId = Number(row.transaction_id);
    const transaction = await queryOne(database.from("class_transactions").select("remaining_classes").eq("id", transactionId).maybeSingle());
    if (transaction) {
      await database.from("class_transactions").update({
        remaining_classes: Number(transaction.remaining_classes ?? 0) + 1,
        updated_at: new Date().toISOString()
      }).eq("id", transactionId);
    }
  }
  if (usage.length) await database.from("class_usage").delete().eq("schedule_id", scheduleId);
}

async function chargeReportUsage(database: any, report: Record<string, unknown>) {
  const schedule = await queryOne(database.from("schedules").select("*").eq("id", report.schedule_id).maybeSingle());
  if (!schedule || schedule.cancelled || schedule.trial) {
    if (schedule?.cancelled) await refundScheduleUsage(database, Number(schedule.id));
    return;
  }

  const studentIds = Array.isArray(schedule.student_ids) && schedule.student_ids.length
    ? schedule.student_ids.map(Number).filter(Boolean)
    : schedule.student_id
      ? [Number(schedule.student_id)]
      : [];
  if (!studentIds.length) return;

  const existingUsage = await queryMany(database.from("class_usage").select("transaction_id").eq("schedule_id", schedule.id));
  const chargedTransactionIds = new Set(existingUsage.map((row) => Number(row.transaction_id)));
  for (const studentId of studentIds) {
    const transactions = await queryMany(
      database
        .from("class_transactions")
        .select("id,remaining_classes,type")
        .eq("student_id", studentId)
        .gt("remaining_classes", 0)
        .order("date")
        .order("id")
    );
    const transaction = transactions.find((row) => row.type !== "monthly-fee" && !chargedTransactionIds.has(Number(row.id)));
    if (!transaction) continue;
    const nextRemaining = Math.max(0, Number(transaction.remaining_classes ?? 0) - 1);
    await database.from("class_transactions").update({
      remaining_classes: nextRemaining,
      updated_at: new Date().toISOString()
    }).eq("id", transaction.id);
    await database.from("class_usage").insert({
      transaction_id: transaction.id,
      schedule_id: schedule.id,
      date: report.date,
      time: String(schedule.timeslot ?? ""),
      duration: String(report.class_duration ?? ""),
      materials: String(report.book ?? ""),
      pages: String(report.pages ?? ""),
      remarks: report.absent ? String(report.absent_reason || "Absent") : "Present",
      charged: true
    });
    chargedTransactionIds.add(Number(transaction.id));
  }
}

async function requireReportScheduleAccess(
  database: any,
  session: Session,
  scheduleId: number,
  reportId?: number
) {
  const schedule = await queryOne(database.from("schedules").select("id,teacher_id").eq("id", scheduleId).maybeSingle());
  if (!schedule) throw new ApiError(404, "schedule_not_found");
  if (session.user.role === "teacher" && Number(schedule.teacher_id) !== session.user.id) throw new ApiError(403, "forbidden");
  if (!reportId) return schedule;

  const report = await queryOne(database.from("reports").select("id,schedule_id,teacher_id").eq("id", reportId).maybeSingle());
  if (!report) throw new ApiError(404, "report_not_found");
  if (Number(report.schedule_id) !== scheduleId) throw new ApiError(400, "cannot_move_report_schedule");
  if (session.user.role === "teacher" && Number(report.teacher_id) !== session.user.id) throw new ApiError(403, "forbidden");
  return schedule;
}

async function reportRoutes(request: Request, path: string, database: any, session: Session) {
  if (path === "/reports" && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    let query = database.from("reports").select("*").order("date");
    if (params.get("start")) query = query.gte("date", params.get("start"));
    if (params.get("end")) query = query.lte("date", params.get("end"));
    if (session.user.role === "teacher") query = query.eq("teacher_id", session.user.id);
    if (session.user.role === "student") {
      const ids = await studentScheduleIds(database, session.user.id, params.get("start"), params.get("end"));
      if (!ids.length) return [];
      query = query.in("schedule_id", ids);
    }
    return await queryMany(query);
  }
  const id = numericIdFromPath(path, "reports");
  requireStaff(session);
  if (path === "/reports" && request.method === "POST") {
    const values = reportValues(await bodyJson(request));
    if (session.user.role === "teacher" && values.teacher_id !== session.user.id) throw new ApiError(403, "forbidden");
    await requireReportScheduleAccess(database, session, values.schedule_id);
    const row = await queryOne(database.from("reports").insert(values).select("*").single());
    if (row) await chargeReportUsage(database, row);
    await writeLog(database, session, request, "Submitted class report", 201, {
      schedule_id: values.schedule_id,
      absent: values.absent
    });
    return row;
  }
  if (id && request.method === "PUT") {
    const values = reportValues(await bodyJson(request));
    if (session.user.role === "teacher" && values.teacher_id !== session.user.id) throw new ApiError(403, "forbidden");
    await requireReportScheduleAccess(database, session, values.schedule_id, id);
    const row = await queryOne(database.from("reports").update(values).eq("id", id).select("*").single());
    if (row) await chargeReportUsage(database, row);
    await writeLog(database, session, request, "Updated class report", 200, {
      report_id: id,
      schedule_id: values.schedule_id,
      absent: values.absent
    });
    return row;
  }
  return null;
}

async function draftRoutes(request: Request, path: string, database: any, session: Session) {
  if (!path.startsWith("/report-drafts")) return null;
  requireStaff(session);
  if (path === "/report-drafts" && request.method === "GET") {
    let query = database.from("report_drafts").select("id,schedule_id,teacher_id,payload,updated_at");
    if (session.user.role === "teacher") query = query.eq("teacher_id", session.user.id);
    const rows = await queryMany(query);
    return rows.map((row) => ({ ...row, ...(row.payload as object), payload: undefined }));
  }
  if (path === "/report-drafts" && request.method === "POST") {
    const body = await bodyJson(request);
    const scheduleId = positiveId(body.schedule_id, "schedule_id");
    const teacherId = positiveId(body.teacher_id, "teacher_id");
    if (session.user.role === "teacher" && teacherId !== session.user.id) throw new ApiError(403, "forbidden");
    const payload = { ...body };
    const row = await queryOne(database.from("report_drafts").upsert({ schedule_id: scheduleId, teacher_id: teacherId, payload, updated_at: new Date().toISOString() }, { onConflict: "schedule_id,teacher_id" }).select("id,updated_at").single());
    return row;
  }
  const id = numericIdFromPath(path, "report-drafts");
  if (id && request.method === "DELETE") {
    await database.from("report_drafts").delete().eq("schedule_id", id);
    return { ok: true };
  }
  throw new ApiError(405, "method_not_allowed");
}

async function transactionRoutes(request: Request, path: string, database: any, session: Session) {
  if (!["/class-transactions", "/class-balances", "/class-usage", "/annual-summary", "/receipts", "/receipts/next", "/receipts/check"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;
  requireRole(session, "admin");
  const params = new URL(request.url).searchParams;
  if (path === "/class-transactions" && request.method === "GET") {
    let query = database.from("class_transactions").select("*").order("date", { ascending: false });
    if (params.get("student_id")) query = query.eq("student_id", positiveId(params.get("student_id"), "student_id"));
    return await queryMany(query);
  }
  if (path === "/class-transactions" && request.method === "POST") {
    const body = await bodyJson(request);
    const type = requiredString(body.type, "type", 40);
    const allowedTypes = new Set(["purchase", "monthly-fee", "monthly-fee-payment", "transfer", "adjustment", "manual", "compensation", "promo", "recommendation", "refund", "cancel-monthly-fee"]);
    const normalizedType = allowedTypes.has(type) ? type : "adjustment";
    const totalClasses = Math.max(-10000, Math.min(10000, Number(body.total_classes ?? 0)));
    const values = {
      student_id: positiveId(body.student_id, "student_id"),
      receipt_no: optionalString(body.receipt_no, 80),
      type: normalizedType,
      total_classes: totalClasses,
      remaining_classes: Math.max(-10000, Math.min(10000, Number(body.remaining_classes ?? totalClasses))),
      teacher_id: body.teacher_id ? positiveId(body.teacher_id, "teacher_id") : null,
      from_student_id: body.from_student_id ? positiveId(body.from_student_id, "from_student_id") : null,
      status: optionalString(body.status, 40),
      amount: body.amount === "" || body.amount == null ? null : Number(body.amount),
      transaction_no: optionalString(body.transaction_no, 80),
      date: DATE.test(String(body.date ?? "")) ? body.date : new Date().toISOString().slice(0, 10),
      notes: optionalString(body.notes, 1000)
    };
    return await queryOne(database.from("class_transactions").insert(values).select("*").single());
  }
  const transactionId = numericIdFromPath(path, "class-transactions");
  if (transactionId && request.method === "PUT") {
    const body = await bodyJson(request);
    const values = {
      status: optionalString(body.status, 40),
      notes: optionalString(body.notes, 1000),
      remaining_classes: Math.max(-10000, Math.min(10000, Number(body.remaining_classes ?? 0))),
      updated_at: new Date().toISOString()
    };
    return await queryOne(database.from("class_transactions").update(values).eq("id", transactionId).select("*").single());
  }
  if (transactionId && request.method === "DELETE") {
    await database.from("class_transactions").delete().eq("id", transactionId).eq("is_baseline", false);
    return { ok: true };
  }
  if (path === "/class-usage" && request.method === "GET") {
    let query = database.from("class_usage").select("*").order("date", { ascending: false });
    if (params.get("transaction_id")) query = query.eq("transaction_id", positiveId(params.get("transaction_id"), "transaction_id"));
    return await queryMany(query);
  }
  if (path === "/class-balances" && request.method === "GET") {
    const students = await queryMany(database.from("students").select("id,name,status").order("name"));
    const transactions = await queryMany(database.from("class_transactions").select("student_id,remaining_classes,type,status"));
    return students.map((student) => {
      const own = transactions.filter((row) => Number(row.student_id) === Number(student.id));
      return {
        ...student,
        balance: own.reduce((sum, row) => sum + Number(row.remaining_classes ?? 0), 0),
        has_monthly_fee: own.some((row) => row.type === "monthly-fee" && row.status === "active")
      };
    });
  }
  if (path === "/annual-summary" && request.method === "GET") {
    const year = Number(params.get("year") ?? new Date().getFullYear());
    const compact = params.get("compact") === "1";
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const [transactions, students, teachers, schedules, reports] = await Promise.all([
      queryMany(database.from("class_transactions").select("*").gte("date", start).lte("date", end)),
      queryMany(database.from("students").select("id,name,username,notes,status,teacher_id,created_at").order("name")),
      queryMany(database.from("teachers").select("id,fullname,username,status,created_at").order("fullname")),
      compact ? Promise.resolve([]) : queryMany(database.from("schedules").select("*").gte("date", start).lte("date", end)),
      compact ? Promise.resolve([]) : queryMany(database.from("reports").select("*").gte("date", start).lte("date", end))
    ]);
    const studentById = new Map(students.map((row: any) => [Number(row.id), row]));
    const teacherById = new Map(teachers.map((row: any) => [Number(row.id), row]));
    const scheduleById = new Map(schedules.map((row: any) => [Number(row.id), row]));
    const receiptKeys = new Set<string>();
    const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, receipts: 0, rmb: 0 }));
    for (const row of transactions) {
      const month = Math.max(1, Math.min(12, Number(String(row.date || "").slice(5, 7)) || 1));
      const amount = Number(row.amount ?? 0) || 0;
      monthly[month - 1].rmb += amount;
      if (row.receipt_no) {
        const key = `${row.student_id || 0}|${row.receipt_no}`;
        if (!receiptKeys.has(key)) {
          receiptKeys.add(key);
          monthly[month - 1].receipts += 1;
        }
      }
    }
    const reportStudentStats = new Map<number, any>();
    const reportTeacherStats = new Map<number, any>();
    for (const report of reports) {
      const schedule = scheduleById.get(Number(report.schedule_id));
      if (!schedule) continue;
      const studentIds = Array.isArray(schedule.student_ids) && schedule.student_ids.length
        ? schedule.student_ids.map(Number).filter(Boolean)
        : schedule.student_id
          ? [Number(schedule.student_id)]
          : [];
      for (const studentId of studentIds) {
        const student = studentById.get(studentId);
        const current = reportStudentStats.get(studentId) ?? {
          student_id: studentId,
          student: student?.name ?? schedule.student ?? "Student",
          username: student?.username ?? "",
          notes: student?.notes ?? "",
          present: 0,
          absent: 0
        };
        if (report.absent) current.absent += 1;
        else current.present += 1;
        reportStudentStats.set(studentId, current);
      }
      const teacherId = Number(report.teacher_id || schedule.teacher_id || 0);
      if (teacherId) {
        const teacher = teacherById.get(teacherId);
        const current = reportTeacherStats.get(teacherId) ?? {
          teacher_id: teacherId,
          teacher: teacher?.fullname ?? teacher?.username ?? "Teacher",
          classes: 0,
          cancelled: 0
        };
        current.classes += 1;
        if (schedule.cancelled) current.cancelled += 1;
        reportTeacherStats.set(teacherId, current);
      }
    }
    const withStudentMeta = (row: any, studentId: number) => {
      const student = studentById.get(studentId);
      return {
        ...row,
        student_id: studentId,
        name: student?.name ?? row.name ?? row.student ?? "Student",
        student: student?.name ?? row.student ?? row.name ?? "Student",
        username: student?.username ?? "",
        notes: student?.notes ?? ""
      };
    };
    const movedStudents = students
      .filter((row: any) => row.status === "Inactive" || row.status === "End of Contract")
      .map((row: any) => withStudentMeta({ type: row.status === "End of Contract" ? "Left" : "Inactive", date: String(row.created_at || "").slice(0, 10) }, Number(row.id)));
    const newStudentsList = students
      .filter((row: any) => String(row.created_at || "").slice(0, 4) === String(year))
      .map((row: any) => withStudentMeta({ date: String(row.created_at || "").slice(0, 10) }, Number(row.id)));
    const monthlyFeeList = transactions
      .filter((row: any) => row.type === "monthly-fee" && row.status === "active")
      .map((row: any) => withStudentMeta({ date: row.date, receipt_no: row.receipt_no, amount: Number(row.amount ?? 0) || 0 }, Number(row.student_id)));
    const cancelMonthlyList = transactions
      .filter((row: any) => row.type === "cancel-monthly-fee")
      .map((row: any) => withStudentMeta({ date: row.date, receipt_no: row.receipt_no }, Number(row.student_id)));
    const busiestMonth = monthly.reduce((best, item) => {
      if (!best || item.receipts > best.receipts || item.rmb > best.rmb) return item;
      return best;
    }, null as any);
    return {
      year,
      totalReceipts: receiptKeys.size,
      totalRmb: monthly.reduce((sum, item) => sum + item.rmb, 0),
      activeStudents: students.filter((row: any) => row.status === "Active").length,
      newStudents: newStudentsList.length,
      becameInactive: students.filter((row: any) => row.status === "Inactive").length,
      leftStudents: students.filter((row: any) => row.status === "End of Contract").length,
      teacherActive: teachers.filter((row: any) => row.status === "Active").length,
      teacherInactive: teachers.filter((row: any) => row.status === "Inactive").length,
      monthly,
      busiestMonth,
      topStudents: [...reportStudentStats.values()].sort((a, b) => (b.present + b.absent) - (a.present + a.absent)).slice(0, 5),
      topTeachers: [...reportTeacherStats.values()].sort((a, b) => b.classes - a.classes).slice(0, 5),
      movedStudents,
      newStudentsList,
      inactiveTeachers: teachers
        .filter((row: any) => row.status === "Inactive")
        .map((row: any) => ({ teacher_id: row.id, name: row.fullname || row.username, date: String(row.created_at || "").slice(0, 10) })),
      monthlyFeeList,
      cancelMonthlyList
    };
  }
  if (path === "/receipts/check" && request.method === "GET") {
    const number = params.get("no") ?? "";
    const row = await queryOne(database.from("class_transactions").select("id").eq("receipt_no", number).limit(1).maybeSingle());
    return { taken: Boolean(row) };
  }
  if (path === "/receipts/next" && request.method === "GET") {
    return { receipt_no: `DEMO-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
  }
  if (path === "/receipts" && request.method === "GET") {
    const year = Number(params.get("year") ?? new Date().getFullYear());
    const search = String(params.get("search") ?? "").trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 30)));
    const before = String(params.get("before") ?? "");
    const [transactions, students] = await Promise.all([
      queryMany(database.from("class_transactions").select("*").neq("receipt_no", "").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`).order("date", { ascending: false }).order("id", { ascending: false })),
      queryMany(database.from("students").select("id,name,username,notes,status"))
    ]);
    const studentById = new Map(students.map((row: any) => [Number(row.id), row]));
    const groups = new Map<string, any>();
    for (const row of transactions) {
      const receiptNo = String(row.receipt_no || "").trim();
      if (!receiptNo) continue;
      const key = `${row.student_id || 0}|${receiptNo}`;
      const student = studentById.get(Number(row.student_id));
      const current = groups.get(key) ?? {
        ...row,
        receipt_no: receiptNo,
        student_name: student?.name ?? "",
        username: student?.username ?? "",
        notes: student?.notes ?? "",
        remaining: 0,
        total_classes: 0,
        amount: 0,
        has_monthly: false,
        cursor: `${row.date}|${row.id}`
      };
      current.remaining += Number(row.remaining_classes ?? 0) || 0;
      current.total_classes += Number(row.total_classes ?? 0) || 0;
      current.amount += Number(row.amount ?? 0) || 0;
      current.has_monthly = current.has_monthly || (row.type === "monthly-fee" && row.status === "active");
      groups.set(key, current);
    }
    let receipts = [...groups.values()].sort((a, b) => String(b.cursor).localeCompare(String(a.cursor)));
    if (search) {
      receipts = receipts.filter((row) =>
        [row.receipt_no, row.student_name, row.username, row.notes, row.transaction_no]
          .some((value) => String(value ?? "").toLowerCase().includes(search))
      );
    }
    const startIndex = before ? Math.max(0, receipts.findIndex((row) => row.cursor === before) + 1) : 0;
    const page = receipts.slice(startIndex, startIndex + limit);
    return {
      receipts: page,
      nextBefore: page.length ? page[page.length - 1].cursor : null,
      hasMore: startIndex + limit < receipts.length,
      total: receipts.length
    };
  }
  throw new ApiError(405, "method_not_allowed");
}

async function logRoutes(request: Request, path: string, database: any, session: Session) {
  if (path !== "/logs" || request.method !== "GET") return null;
  requireRole(session, "admin");
  const params = new URL(request.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 30)));
  let query = database
    .from("activity_logs")
    .select("id,actor_role,actor_id,actor_name,method,path,action,status,details,created_at")
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.get("before")) query = query.lt("id", positiveId(params.get("before"), "before"));
  if (params.get("date")) {
    const date = params.get("date")!;
    if (!DATE.test(date)) throw new ApiError(400, "invalid_date");
    query = query.gte("created_at", `${date}T00:00:00+08:00`).lt("created_at", `${date}T23:59:59.999+08:00`);
  }
  const search = searchToken(params.get("search") ?? "");
  if (search) query = query.or(`action.ilike.%${search}%,actor_name.ilike.%${search}%,path.ilike.%${search}%`);
  const rows = await queryMany(query);
  const page = rows.slice(0, limit);
  return {
    logs: page,
    hasMore: rows.length > limit,
    nextBefore: page.length ? page[page.length - 1].id : null
  };
}

async function upload(request: Request, database: any, storage: any, session: Session) {
  requireStaff(session);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, "invalid_upload");
  const extension = ALLOWED_UPLOAD_TYPES.get(file.type);
  if (!extension) throw new ApiError(400, "invalid_upload_type");
  const logicalDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const existing = await queryMany(database.from("uploads").select("id,size_bytes").eq("session_token_hash", session.tokenHash).eq("logical_date", logicalDate));
  if (existing.length >= 20) throw new ApiError(429, "upload_daily_limit");
  const allUploads = await queryMany(database.from("uploads").select("size_bytes"));
  const totalSize = allUploads.reduce((sum, row) => sum + Number(row.size_bytes), 0);
  if (totalSize + file.size > 100 * 1024 * 1024) throw new ApiError(429, "upload_storage_limit");
  const objectPath = `visitor/${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
  const { error } = await storage.from("cn-private").upload(objectPath, file, { contentType: file.type, upsert: false });
  if (error) throw new ApiError(503, "upload_unavailable");
  const insert = await database.from("uploads").insert({ session_token_hash: session.tokenHash, object_path: objectPath, size_bytes: file.size, logical_date: logicalDate });
  if (insert.error) {
    await storage.from("cn-private").remove([objectPath]);
    throw new ApiError(503, "upload_unavailable");
  }
  const signed = await storage.from("cn-private").createSignedUrl(objectPath, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) throw new ApiError(503, "upload_unavailable");
  return { url: signed.data.signedUrl };
}

async function handle(request: Request, context: any) {
  const path = routePath(request);
  const database = context.supabaseAdmin.schema("cn_demo");

  if (path === "/auth/login" && request.method === "POST") return json(request, await login(request, database));
  if (path === "/dev/maintenance" && request.method === "GET") return json(request, { on: false });
  if (path.startsWith("/dev/") || path.startsWith("/admin-permissions") || path.startsWith("/backup")) {
    throw new ApiError(403, "not_available_in_portfolio_demo");
  }

  const session = await requireSession(request, database);
  if (path === "/auth/logout" && request.method === "POST") {
    await database.from("sessions").delete().eq("token_hash", session.tokenHash);
    return json(request, { ok: true });
  }
  if (path === "/my-permissions" && request.method === "GET") {
    requireRole(session, "admin");
    return json(request, { perms: { view_classes: true, view_modify: true, view_remaining: true, view_receipts: true, view_yearly: true, view_permissions: false, view_logs: true, notify_low_balance: true } });
  }
  if (path === "/me/language" && request.method === "POST") {
    const body = await bodyJson(request);
    const language = new Set(["en", "zh"]).has(String(body.language)) ? String(body.language) : "en";
    const table = session.user.role === "admin" ? "admins" : session.user.role === "teacher" ? "teachers" : "students";
    await database.from(table).update({ language }).eq("id", session.user.id);
    return json(request, { ok: true });
  }
  if (path === "/notifications" && request.method === "GET") {
    let query = database.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
    if (session.user.role === "teacher") query = query.eq("teacher_id", session.user.id);
    if (session.user.role === "student") query = query.eq("student_id", session.user.id);
    return json(request, await queryMany(query));
  }
  if (path === "/notifications" && request.method === "POST") {
    const body = await bodyJson(request);
    let mutation = database.from("notifications").update({ read: true }).eq("id", positiveId(body.id));
    if (session.user.role === "teacher") mutation = mutation.eq("teacher_id", session.user.id);
    if (session.user.role === "student") mutation = mutation.eq("student_id", session.user.id);
    await mutation;
    return json(request, { ok: true });
  }
  const notificationId = numericIdFromPath(path, "notifications");
  if (notificationId && request.method === "DELETE") {
    let mutation = database.from("notifications").delete().eq("id", notificationId);
    if (session.user.role === "teacher") mutation = mutation.eq("teacher_id", session.user.id);
    if (session.user.role === "student") mutation = mutation.eq("student_id", session.user.id);
    await mutation;
    return json(request, { ok: true });
  }
  if (path === "/notifications/read-all" && request.method === "POST") {
    let mutation = database.from("notifications").update({ read: true }).eq("read", false);
    if (session.user.role === "teacher") mutation = mutation.eq("teacher_id", session.user.id);
    if (session.user.role === "student") mutation = mutation.eq("student_id", session.user.id);
    await mutation;
    return json(request, { ok: true });
  }
  if (path === "/notifications/clear-all" && request.method === "POST") {
    let mutation = database.from("notifications").delete().neq("id", 0);
    if (session.user.role === "teacher") mutation = mutation.eq("teacher_id", session.user.id);
    if (session.user.role === "student") mutation = mutation.eq("student_id", session.user.id);
    await mutation;
    return json(request, { ok: true });
  }
  if (path === "/my-classes" && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    let query = database.from("schedules").select("*").order("date");
    if (params.get("start")) query = query.gte("date", params.get("start"));
    if (params.get("end")) query = query.lte("date", params.get("end"));
    if (session.user.role === "teacher") query = query.eq("teacher_id", session.user.id);
    if (session.user.role === "student") query = query.contains("student_ids", [session.user.id]);
    const schedules = await queryMany(query);
    const ids = schedules.map((row) => Number(row.id)).filter(Boolean);
    const reports = ids.length
      ? await queryMany(database.from("reports").select("*").in("schedule_id", ids).order("date"))
      : [];
    const teacherIds = [...new Set(schedules.map((row) => Number(row.teacher_id)).filter(Boolean))];
    const teachers = teacherIds.length
      ? await queryMany(database.from("teachers").select("id,fullname").in("id", teacherIds))
      : [];
    const teacherNames = new Map(teachers.map((row) => [Number(row.id), row.fullname]));
    const enrichedSchedules = schedules.map((row) => ({ ...row, teacher_name: teacherNames.get(Number(row.teacher_id)) ?? "" }));
    const enrichedReports = reports.map((row) => ({ ...row, teacher_name: teacherNames.get(Number(row.teacher_id)) ?? "" }));
    return json(request, { schedules: enrichedSchedules, reports: enrichedReports });
  }
  if (path === "/schedule-limits" && request.method === "GET") return json(request, { max_per_day: 20 });
  if (path === "/upload" && request.method === "POST") return json(request, await upload(request, database, context.supabaseAdmin.storage, session), 201);

  const accountResult = await accountRoutes(request, path, database, session);
  if (accountResult !== null) return json(request, accountResult);
  const scheduleResult = await scheduleRoutes(request, path, database, session);
  if (scheduleResult !== null) return json(request, scheduleResult);
  const reportResult = await reportRoutes(request, path, database, session);
  if (reportResult !== null) return json(request, reportResult);
  const draftResult = await draftRoutes(request, path, database, session);
  if (draftResult !== null) return json(request, draftResult);
  const transactionResult = await transactionRoutes(request, path, database, session);
  if (transactionResult !== null) return json(request, transactionResult);
  const logResult = await logRoutes(request, path, database, session);
  if (logResult !== null) return json(request, logResult);

  throw new ApiError(404, "not_found");
}

const authorized = withSupabase({ auth: "publishable:cn_demo" }, async (request, context) => {
  try {
    return await handle(request, context);
  } catch (error) {
    if (error instanceof ApiError) return json(request, { error: error.code }, error.status);
    console.error(JSON.stringify({ event: "cn_api_error", appId: APP_ID, category: "unexpected" }));
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
