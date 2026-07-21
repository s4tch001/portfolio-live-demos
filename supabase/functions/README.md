# Edge functions

## Reset coordinator

`reset-coordinator` is an internal POST-only function authenticated by the named Supabase secret key `automations`. The gateway JWT check is disabled for this function because current Supabase service-to-service calls authenticate through the `apikey` header; `@supabase/server` performs the named-secret validation before the handler runs.

Each invocation claims at most five due applications, executes their transactional database handlers, and removes no more than 500 Storage objects per application. It verifies whether objects remain and persists `storage_pending` for the next retry rather than claiming false success.

The function logs only event names, counts, public application ids, and allowlisted error categories. It never reads or logs raw secret values.

Phase 2.2 is local implementation only. Do not deploy this function until the named secret key, database migration, app reset handlers, and Cron invocation have been reviewed in their scheduled sub-phases.
