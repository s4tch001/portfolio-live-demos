# Phase 3 local application completion

Status: complete locally; committed but not deployed.

Phase 3 adapted all five projects inside this isolated workspace. No source
project was changed during these subphases. The separately authorized Payroll
source fix remains recorded in its own original repository history.

## Delivered applications

| Demo | Delivered behavior | Reset behavior |
| --- | --- | --- |
| CN | `admin`, `testteacher`, and `teststudent` login hints; fictional teachers, students, schedules, reports, receipts, balances, and usage; master routes denied | Purges visitor data, restores stable fictional baseline and immutable credentials, clears bounded private visitor uploads |
| RCMI | Administrator password hint and eight fictional members/leaders/guests with relative attendance | Purges visitor changes and restores the fictional directory, attendance, and immutable password |
| Hours | Server-verified `password` login; session-isolated calendar entries; no original URL/key | Cascading session deletion clears every visitor entry and restores the protected password hash |
| Payroll | Blur-only dependent-hours synchronization in both directions; invalid negative remainder feedback | No-op because calculations are never persisted |
| Travels | Eight Philippine tour cards and meaningful Hero/About copy with no lorem ipsum | No-op because the showcase is static |

The persistent notice on every page identifies the frontend as a Netlify demo,
the backend/database as Supabase, sample data as fictional, and visitor data as
disposable at 00:00 Asia/Manila.

## Deployment boundary

This phase created local migration and Edge Function source only. It did not:

- apply the app migrations to the remote Supabase project;
- deploy `cn-api`, `rcmi-api`, or `hours-api`;
- create app-specific Supabase publishable keys;
- enable any application in `demo_control.applications`;
- create the reset Cron job;
- create or configure Netlify sites;
- configure Cloudflare subdomains; or
- update the portfolio repository.

Those actions belong to Phase 4. The first Phase 4 deployment must apply and
verify migrations in order, deploy the three Edge APIs, create named public
keys, run negative credential/reset tests, and only then enable reset entries.

## Verification completed

- Source-isolation and secret-pattern audit across the workspace.
- Toolchain and lockfile audit using Node 24/npm 11.
- Supabase configuration/privilege contract audit.
- 49 contract and integration tests.
- Production Vite builds for all five applications.
- Rolldown bundle validation for the three app Edge Functions.
- `npm audit --audit-level=high`, which passes after removing the former
  ExcelJS transitive audit chain from the RCMI export.

See `docs/security/phase-3-review.md` for remaining deployment and dependency
risks.
