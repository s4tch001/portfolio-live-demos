# Demo-only Supabase setup

This repository uses one dedicated Supabase project for all five disposable demos. It must never be connected to a production project or populated with real user data.

## Free project settings

- Project name: portfolio-live-demos
- Project reference: ivqfxdibluhgyttgxbmz
- Project URL: https://ivqfxdibluhgyttgxbmz.supabase.co
- Plan: Free
- Region: Southeast Asia (Singapore)
- Database password: generate a unique strong value and save it in a password manager
- Production data import: prohibited

The project was created with the Data API enabled, automatic table exposure disabled, and automatic RLS enabled. Every future API object therefore requires explicit grants and reviewed RLS policies.

Supabase currently allows two active Free projects and may pause a low-activity Free project after roughly seven days. A later phase will add a small scheduled health query, but this remains a best-effort Free-tier safeguard rather than an uptime guarantee.

## Secret boundary

Browser applications may receive only the project URL and publishable key. Database passwords, personal access tokens, secret keys, and legacy service-role keys are server-only and must be stored in Supabase, Netlify, or GitHub encrypted secret settings as appropriate.

Do not paste a secret into source code, a committed environment file, an issue, a build log, or chat. The repository audit rejects common Supabase secret formats and non-example environment files.

## Local CLI

The Supabase CLI is pinned as a project dev dependency. Use npm run supabase -- followed by CLI arguments, or use the prepared commands:

- npm run supabase:start
- npm run supabase:status
- npm run supabase:db-reset
- npm run supabase:stop

The local stack requires Docker. The workspace is linked to the demo project; generated link state remains under the ignored supabase/.temp directory and is never committed.
