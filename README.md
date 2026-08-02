# Portfolio Live Demos

Resettable public demos for the projects featured on [pauuu.dev](https://pauuu.dev). This repository is separate from the original project repositories so visitors can try the apps without touching production data.

## Live demos

| Demo | Public URL | Runtime/data model |
| --- | --- | --- |
| CN Class Management / Sunset-Speaks | [cn-demo.pauuu.dev](https://cn-demo.pauuu.dev) | React/Vite, Supabase Edge API, private CN schema and bounded Storage uploads |
| RCMI Attendance Checker | [rcmi-demo.pauuu.dev](https://rcmi-demo.pauuu.dev) | React/Vite, Supabase Edge API, private directory and attendance schema |
| Hours Tracker | [hours-demo.pauuu.dev](https://hours-demo.pauuu.dev) | Vanilla JavaScript/Vite, Supabase Edge API, session-isolated hour entries |
| Payroll Splitter | [payroll-demo.pauuu.dev](https://payroll-demo.pauuu.dev) | Vanilla JavaScript/Vite, browser-only calculations |
| P Travels | [travels-demo.pauuu.dev](https://travels-demo.pauuu.dev) | React/Vite static showcase with no persistence |

The RCMI administrator preview is available at `/administrator`. Each demo displays a shared portfolio notice explaining that it is a disposable preview. Visitor-created data is cleared daily, protected seed records are restored, and demo credentials must not be changed or reused elsewhere.

## What this repository contains

- Isolated Vite demo editions of five portfolio projects
- Shared `@pauuu-demo/demo-shell` notices with hide/show controls
- Netlify-ready frontend builds for five custom demo subdomains
- Supabase schemas, Edge Functions, and reset-coordinator tooling
- Fictional seed data for CN Class Management and RCMI Attendance Checker
- Daily reset behavior based on the Asia/Manila logical date
- Security headers, robots policies, `llms.txt` files, and immutable caching for hashed assets

The demo metadata is intentionally kept per application: every app owns its title, canonical URL, social cards, structured data, sitemap, robots policy, and `llms.txt`. These are portfolio previews and should not be mistaken for the canonical P-Devs website or production client systems.

## Deployment status

Deployment evidence is tracked in `config/deployment-state.json`. The recorded Phase 4.5 state confirms:

- Five Netlify sites and their `pauuu.dev` custom domains are configured.
- HTTPS, custom domains, security headers, immutable assets, SPA routes, and app APIs have live-verification evidence.
- CN, RCMI, and Hours Edge APIs use app-specific publishable keys and protected server-side operations.
- The Supabase reset coordinator and scheduled daily reset workflow are active and idempotent.
- All five demo applications are enabled in the deployment state.

## Stack

- Vite-based demo frontends
- React 19 for CN, RCMI, and Travels
- Vanilla JavaScript for Hours and Payroll
- Netlify for frontend hosting
- Supabase for database, Edge Functions, Storage, and scheduled reset jobs
- Cloudflare DNS for the demo subdomains under `pauuu.dev`

## Local setup

Use the Node.js version in `.nvmrc` (`26`). The repository requires Node `>=24 <27` and npm `>=11 <13`.

```powershell
npm.cmd install --ignore-scripts
```

To start the CN frontend, Edge API, and a freshly reset local-only database with the protected preview accounts, open Docker Desktop and run:

```powershell
npm.cmd run dev:cn-local
```

This command builds an isolated local migration profile, skips hosted reset-scheduler migrations, uses explicit local Supabase flags, refuses non-loopback API URLs, and never reads or writes the deployed demo database.

The blank local database contains only `admin`, `testteacher`, and `teststudent`; all three use the documented demo password. It contains no schedules, reports, class packages, or other sample records. Image uploads use the local private Storage bucket and return loopback-only signed URLs.

On Windows, the interactive helper can start or stop the CN app, its exact local Supabase project, and optionally Docker Desktop:

```powershell
.\tool.ps1
```

Copy `.env.example` into an ignored local env file when a command needs public demo configuration. Never place service-role keys or other server secrets in Vite variables.

## Common commands

```powershell
npm.cmd run check
npm.cmd run build:apps
npm.cmd test
npm.cmd audit --audit-level=high
```

Optional live audit:

```powershell
npm.cmd run audit:netlify:live
```

`audit:netlify:live` checks the custom domains by default and requires the app-specific publishable keys in the environment. Set `DEMO_HOST_MODE=netlify` to check the original Netlify hostnames instead. The audit does not print or store key values.

## Demo safety rules

- Demo credentials in preview notices are intentional test accounts.
- Default credentials and protected seed data must survive daily resets.
- Visitors must not be able to change protected default credentials.
- CN, RCMI, and Hours use app-specific publishable keys and isolated API routes.
- Payroll and Travels do not persist visitor data.
- Do not enter real personal, school, attendance, payroll, or client information.
- Keep each app's canonical URL, sitemap, robots policy, `llms.txt`, and reset-data notice accurate.

## Documentation

- Phase 3 completion and verification: `docs/phase-3-completion.md`
- Phase 4.1 Supabase schema deployment: `docs/phase-4-1-supabase-schema-deployment.md`
- Phase 4.2 Supabase Edge API deployment: `docs/phase-4-2-edge-api-deployment.md`
- Phase 4.3 daily reset activation: `docs/phase-4-3-daily-reset-activation.md`
- Phase 4.4 Netlify deployment: `docs/phase-4-4-netlify-deployment.md`
- Phase 4.5 custom domains and layout acceptance: `docs/phase-4-5-custom-domains.md`
- Phase 3 security review: `docs/security/phase-3-review.md`
- System design: `docs/architecture/system-design.md`
- Daily reset contract: `docs/architecture/reset-contract.md`
- Source isolation rules: `config/source-import-policy.json`
- Supabase setup and deployment history: `docs/supabase-setup.md` and `docs/supabase-deployment.md`
- Preview baseline requirements: `specs/demo-preview-baselines.spec.md`
