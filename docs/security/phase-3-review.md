# Phase 3 security review

Review scope: the five local demo applications, three app Edge APIs, five app
reset migrations, shared reset coordinator integration, and dependency lock.

## Implemented controls

- Original runtime databases, environment files, secrets, and server folders
  were not imported. Workspace isolation and denylist scans pass.
- Browser code uses only environment-provided Supabase URLs and app-specific
  publishable keys. No service key is present in a frontend bundle.
- CN, RCMI, and Hours app schemas deny `anon` and `authenticated` table access;
  Edge APIs use server-side schema access behind named publishable keys.
- Public credentials are hashed and verified in PostgreSQL. Protected-row
  triggers plus API rejection prevent credential changes; UI mutation controls
  are removed.
- CN reserves `devpau` and denies permissions, developer-tools, security, and
  backup endpoints to the preview administrator.
- Hours entries are partitioned by hashed, expiring visitor session rather
  than shared across all visitors.
- Mutation, login, request-body, array, and upload limits are bounded. App
  origins are explicitly allowlisted.
- Reset handlers are not executable by browser roles or `service_role`; the
  existing private reset-control wrapper remains the only execution path.
- Static `noindex` metadata and the shared preview warning are present on all
  five applications. These are indexing/privacy warnings, not authorization.

## Residual risks before public launch

| Risk | Current treatment | Phase 4 requirement |
| --- | --- | --- |
| App migrations and functions are not running remotely | No app reset is enabled, preventing false cleanup claims | Apply migrations in order, deploy functions, and run live negative-path tests before activation |
| Database SQL has contract tests but no fresh local Docker database execution in Phase 3 | Static privilege and schema audits pass | Run migration dry-run/reset or linked preflight and confirm reset idempotency |
| RCMI uses ExcelJS 4.4.0, which brings `uuid` 8.3.2 with a moderate bounds advisory in UUID v3/v5/v6 buffer APIs | RCMI calls ExcelJS workbook export; ExcelJS uses UUID v4 without a caller-provided buffer. The high-severity audit gate passes. A forced npm fix would downgrade ExcelJS across a breaking major | Retest and upgrade when ExcelJS ships a compatible patched dependency; do not apply the breaking forced downgrade blindly |
| CN and RCMI JavaScript bundles are large, and Travels includes a roughly 3 MB hero image | Functionality and production builds pass | Measure Netlify previews and optimize/lazy-load only if free-tier bandwidth or user experience requires it |
| Free Supabase/Netlify services can pause or become temporarily unavailable | APIs fail closed and reset work is retryable | Add the planned bounded health check and verify retry behavior after deployment |
| No browser end-to-end tests exist against the final public hostnames | Local component/contract tests and production builds pass | Test login, CRUD, restrictions, reset, mobile notice, and subdomain CORS on deployed previews |

No high or critical dependency advisory is present at the end of Phase 3. Two
moderate findings refer to the same transitive UUID advisory through ExcelJS.
