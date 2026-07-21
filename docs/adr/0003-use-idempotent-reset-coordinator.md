# ADR 0003: Use an idempotent reset coordinator

- Status: Accepted
- Date: 2026-07-21

## Context

Visitor-created database rows and uploaded objects must clear daily. Database cleanup can be transactional, while Supabase Storage cleanup requires the Storage API and may span multiple calls. Free-tier outages or function timeouts must not produce false success or damage protected defaults.

## Decision

Use Supabase Cron as the reset authority and invoke a server-side Edge Function coordinator every 15 minutes. Track one leased state machine per app and Manila logical date. Reset each app's database transactionally through a restricted function, then delete its disposable object prefix with bounded Storage API calls and verification. Retry incomplete stages until success.

## Consequences

- Duplicate schedules and retries are safe and observable.
- Partial database and Storage completion is explicit instead of being reported as success.
- The coordinator is more code than a direct nightly truncate, but supports failure recovery and private object cleanup.
- The database and Storage stages are not globally atomic; the durable state machine provides eventual convergence.
- Reset functions and service-role credentials require strict server-only access.

## Alternatives considered

- One direct SQL truncate at midnight: cannot safely remove Storage objects and offers poor retry visibility.
- Netlify scheduled function as the reset authority: adds a second platform dependency and has a short scheduled-function execution window.
- Delete rows from the Storage metadata schema with SQL: unsupported for object cleanup because it can orphan stored objects.
- Hard-code Manila as UTC+8: rejected in favor of IANA timezone-aware date calculation.
