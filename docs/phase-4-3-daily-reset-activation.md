# Phase 4.3 daily reset activation

Status: complete on 2026-07-22 (Asia/Manila).

## Scope

This subphase installed the Supabase Cron and `pg_net` extensions, activated all
five reviewed reset registrations, and scheduled the private reset coordinator
every 15 minutes. It did not create Netlify sites, configure Cloudflare DNS,
edit the portfolio, or perform any Phase 4.4 work.

The schedule is intentionally more frequent than midnight. The coordinator
calculates the logical date in `Asia/Manila`, creates at most one app/day run,
and returns no work after that run succeeds. This makes a delayed or missed
invocation retryable without causing duplicate daily resets.

## Secret boundary

The job command contains only:

```sql
select demo_control.dispatch_reset_coordinator();
```

The project URL and named `automations` secret-key value live in Supabase Vault
under `portfolio_demo_project_url` and `portfolio_demo_automations_key`. The
private dispatcher reads them at execution time. No key value appears in a
migration, Cron command, status response, application bundle, test output, or
repository file.

Only the database owner can execute the Vault-backed dispatcher. A separate
status RPC is executable by `service_role` for server-side verification and
omits job commands, Cron response details, Vault values, and database errors.

## Hosted Data API compatibility fix

The first activation proved that Payroll and P Travels resets succeeded but CN,
RCMI, and Hours failed with the bounded category `database_rpc_failed`.
Transactional handler and wrapper self-tests passed as the database owner. A
private service-role diagnostic then identified PostgreSQL error `21000`:
`DELETE requires a WHERE clause`.

The hosted Data API applies this safe-update guard to its execution context.
Migration `20260722001000` retained the reviewed full-reset intent while making
it explicit as `DELETE ... WHERE true` for the exact allowlisted tables. It
also asserts that none of the three persistent handlers retains an
unconditional `DELETE` without a `WHERE` clause. No safety setting was disabled.

## Live evidence

- Recovery invocation: HTTP `200`, three claimed, three succeeded, zero pending,
  and zero failed.
- Immediate idempotency invocation: HTTP `200`, zero claimed.
- Private status: all five applications enabled, ready, and `succeeded` for
  logical date `2026-07-22`; no current error category.
- Supabase Cron: job `portfolio-demo-reset-dispatch` active at
  `*/15 * * * *`; the 10:30 Asia/Manila run completed with status `succeeded`.
- CN after reset: `admin`, `testteacher`, and `teststudent` authenticated with
  the fixed preview password; three teachers, six students, seven schedules,
  and two reports remained; protected-password and restricted-development
  requests returned `403`.
- RCMI after reset: eight fictional members remained; administrator login
  worked; password mutation returned `403`.
- Hours after reset: the default password worked, disposable entries were
  empty, and password mutation returned `403`.

The higher attempt counts for the first Manila logical day are retained as
honest activation history. Successful state and a null error category are the
current health signals; future logical days begin with a new app/day row.

## Rollback

If reset behavior regresses before public hosting:

1. Set every `demo_control.applications.enabled` value to `false` in one
   transaction.
2. Unschedule only the named `portfolio-demo-reset-dispatch` job.
3. Keep reset history and Vault entries for diagnosis; rotate the automation key
   only if exposure is suspected.
4. Correct the forward migration, run all handler/RPC checks, then reactivate
   all five registrations together.

Do not drop `pg_cron` as a routine rollback: Supabase documents that disabling
the extension permanently deletes all Cron jobs in the project.

## Next gate

Phase 4.4 may proceed only after the next user go signal. Netlify, Cloudflare,
public subdomains, and portfolio links remain pending.
