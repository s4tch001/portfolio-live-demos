# Edge functions

## Reset coordinator

`reset-coordinator` is an internal POST-only function authenticated by the named Supabase secret key `automations`. The gateway JWT check is disabled for this function because current Supabase service-to-service calls authenticate through the `apikey` header; `@supabase/server` performs the named-secret validation before the handler runs.

Each invocation claims at most five due applications, executes their transactional database handlers, and removes no more than 500 Storage objects per application. It verifies whether objects remain and persists `storage_pending` for the next retry rather than claiming false success.

The function logs only event names, counts, public application ids, and allowlisted error categories. It never reads or logs raw secret values.

The function was deployed in Phase 2.4 after the named `automations` key and control migration were configured. It remains inert because every application is disabled and no Cron invocation exists. Later application phases must install and review their own reset handlers before enabling their registrations.
