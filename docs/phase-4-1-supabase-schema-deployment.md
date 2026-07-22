# Phase 4.1 Supabase app-schema deployment

Status: complete on 2026-07-22 (Asia/Manila).

## Scope

This subphase deployed only the five reviewed application-schema migrations to
the dedicated `portfolio-live-demos` Supabase Free project. It did not deploy
app Edge Functions, create app publishable keys, enable reset registrations,
install Cron, create Netlify sites, configure Cloudflare, or edit the portfolio.

## Preflight and deployment evidence

- Linked project reference matched `ivqfxdibluhgyttgxbmz`.
- Before deployment, remote history contained only foundation migration
  `20260722000100`.
- `supabase db push --linked --dry-run` selected exactly migrations
  `20260722000200` through `20260722000600` in order.
- The remote push applied CN, RCMI, Hours, Payroll, and Travels migrations
  successfully. PostgreSQL reported only the expected notice that `pgcrypto`
  already existed.
- Post-deployment history matched all six local migration versions.
- Remote database lint checked `cn_demo`, `rcmi_demo`, `hours_demo`,
  `payroll_demo`, `travels_demo`, `demo_control`, `extensions`, and `public`
  with zero errors.

Each app migration is transactional. Its final control update sets
`database_reset_ready = true` for only that app and never sets `enabled = true`.
The pre-existing reset registry default is disabled, so no cleanup job can be
claimed. No Cron schedule exists.

## Verification limitation

An optional data-only `demo_control` dump could not run because the Supabase
CLI dump helper requires Docker Desktop, which was not running. The temporary
empty audit file was removed. This did not affect the migration push or linked
database lint. Safety is supported by the previously verified disabled remote
state, transactional migration history, and automated source checks that reject
any `enabled = true` app migration.

If a manual Dashboard confirmation is desired, run this read-only query in the
Supabase SQL Editor:

```sql
select app_id, database_reset_ready, enabled
from demo_control.applications
order by app_id;
```

Expected result: five rows with `database_reset_ready = true` and
`enabled = false`.

## Rollback and failure policy

These migrations are additive and the environment contains fictional demo data
only. There is no automatic destructive down migration. If a later validation
fails, keep every registration disabled and deploy a reviewed forward-fix
migration. Dropping a demo schema would require a separate explicit approval.

## Next gated work

Phase 4.2 may create the named `cn`, `rcmi`, and `hours` publishable keys,
deploy the matching Edge Functions, and run unauthenticated/authenticated
negative-path verification. It must not begin without the next go signal.
