# Phase 4.2 Supabase Edge API deployment

Status: complete on 2026-07-22 (Asia/Manila).

## Scope

This subphase created three app-specific publishable keys, exposed only the
three schemas required by persistent demo APIs, and deployed `cn-api`,
`rcmi-api`, and `hours-api`. It did not enable reset registrations, install
Cron, create Netlify sites, configure Cloudflare DNS, or edit the portfolio.

Supabase requires publishable-key names to contain at least four characters,
so the deployed names are `cn_demo`, `rcmi_demo`, and `hours_demo`. The Edge
Functions use the corresponding exact `publishable:<name>` authorization modes;
the shared `default` key and either sibling app key are rejected.

## Data API boundary

The reviewed exposed-schema list is limited to `public`, `graphql_public`,
`cn_demo`, `rcmi_demo`, and `hours_demo`, with a 500-row response limit.
`demo_control`, `payroll_demo`, and `travels_demo` are not exposed. Direct
browser-role requests to all three app schemas returned PostgreSQL permission
code `42501`; server-side Edge access remained available through explicit
`service_role` grants.

## Deployment evidence

The final remote function state was:

| Function | Version | Status | Platform JWT check |
| --- | ---: | --- | --- |
| `reset-coordinator` | 5 | active | disabled |
| `cn-api` | 6 | active | disabled |
| `rcmi-api` | 5 | active | disabled |
| `hours-api` | 5 | active | disabled |

Platform JWT verification is intentionally disabled because modern
`sb_publishable_...` keys are not JWTs. Each handler performs exact named-key
authorization through `@supabase/server` before any app route executes.

## Live verification

- Missing-key calls returned `401` for all three APIs.
- Calls with a sibling or shared default publishable key returned `401`.
- Disallowed origins returned `403`; approved-origin preflights returned `204`.
- CN authenticated as `admin`, `testteacher`, and `teststudent`; returned three
  teachers, six students, seven schedules, and two reports; rejected a protected
  admin-password mutation and the restricted development/security route.
- RCMI returned exactly eight fictional members, accepted the preview
  administrator password, and rejected its password-mutation endpoint.
- Hours accepted the preview password, returned the authenticated entries
  response, and rejected its password-mutation endpoint.
- The coordinator returned HTTP `200` with zero claimed, succeeded, pending, and
  failed resets, confirming every app registration remains disabled.

The first CN deployment exposed a role-agnostic column selection defect: admin
and teacher queries requested the student-only `name` column. Phase 4.2 fixed
both login and session hydration with role-specific column lists, added a
regression contract, redeployed CN, and repeated the full live test successfully.

No API key value, password hash, session token, database password, or personal
access token is stored in this repository.

## Repository verification

- `npm run check` passed all isolation, toolchain, Supabase, and application
  audits plus 57 automated tests.
- Production builds passed for all five demos. CN and the separately loaded RCMI
  Excel export remain above Vite's advisory chunk-size threshold; this is a
  performance warning, not a build failure.
- `npm audit --audit-level=high` passed. The existing ExcelJS dependency retains
  two moderate transitive `uuid` findings; npm offers only a forced breaking
  downgrade, so no unsafe automated dependency change was applied.
- Linked local and remote migration histories still match all six committed
  versions exactly.

## Rollback and next gate

If an API regression is found before hosting, keep resets disabled and redeploy
the last reviewed function bundle. Key removal is not automatic because it
would invalidate a future Netlify environment; revoke a key only after removing
its frontend use.

Phase 4.3 may proceed only after the next user go signal. Netlify, Cloudflare,
Cron/reset activation, and portfolio changes remain pending.
