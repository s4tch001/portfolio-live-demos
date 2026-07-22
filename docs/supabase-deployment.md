# Supabase foundation deployment

This is the sanitized Phase 2.4 deployment record for the dedicated preview project. It intentionally excludes API key values, database credentials, personal access tokens, request identifiers, cookies, and other secret-bearing headers.

## Target

- Project: `portfolio-live-demos`
- Project reference: `ivqfxdibluhgyttgxbmz`
- Region: `ap-southeast-1` (Singapore)
- Plan: Free
- Verified: 2026-07-22 (Asia/Manila)

## Applied foundation

- Remote migration: `20260722000100_demo_reset_control.sql`
- Edge Function: `reset-coordinator`
- Function status at verification: `ACTIVE`, version 1
- Gateway JWT verification: disabled by design
- Handler authentication: named Supabase secret key `automations`, validated by `@supabase/server`
- Cron schedule: not installed

Gateway JWT verification is disabled because modern Supabase secret keys are not JWTs. The handler still rejects callers unless the `apikey` header matches the specifically named `automations` key.

## Verification evidence

- Linked migration history matched the local migration version.
- Remote database lint at error level reported no schema errors.
- An unauthenticated `POST` returned HTTP 401.
- An authenticated Dashboard `POST` using the named key returned HTTP 200 with `ok: true`.
- The authenticated response reported `claimed: 0`, `succeeded: 0`, `pending: 0`, and `failed: 0`.
- The legacy JWT-based `anon` and `service_role` API keys were disabled after local CLI output exposed their values.
- A second authenticated Dashboard `POST` after legacy-key deactivation still returned HTTP 200, confirming that the coordinator uses the named modern secret key.

The zero-claim response was expected during Phase 2.4. Phase 4.1 later set the
five registrations to `database_reset_ready = true`, while preserving
`enabled = false`, so the coordinator still cannot claim application cleanup.

## Activation gate

Phase 4.1 deployed each isolated schema, protected credential or fictional
baseline, and idempotent `reset_demo_data(date)` handler. Registrations must
remain disabled until the app APIs and live negative-path tests are complete.
The daily Manila schedule must not be installed until every enabled application
satisfies reset and isolation acceptance tests.

See `docs/phase-4-1-supabase-schema-deployment.md` for the app-schema deployment
record.
