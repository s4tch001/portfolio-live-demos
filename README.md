# Portfolio Live Demos

Resettable public demos for the projects featured on [pauuu.dev](https://pauuu.dev).
This repo is separate from the original project repositories, so portfolio
visitors can try the apps without touching production data.

## Live Demos

- [CN Class Management](https://cn-demo.pauuu.dev)
- [RCMI Attendance Checker](https://rcmi-demo.pauuu.dev) - open `/administrator` manually for the administrator panel
- [Hours Tracker](https://hours-demo.pauuu.dev)
- [Payroll Splitter](https://payroll-demo.pauuu.dev)
- [P Travels](https://travels-demo.pauuu.dev)

Each demo shows a persistent portfolio notice explaining that it is a shared
preview. Visitor-created data is cleared daily, protected seed records are
restored, and demo subdomains are marked `noindex` so only the main portfolio is
intended for search indexing.

## What This Repo Contains

- Isolated demo editions of five portfolio projects
- Shared preview notices with hide/show controls
- Netlify-ready frontend builds
- Supabase schema, Edge Function, and reset tooling
- Fictional seed data for CN Class Management and RCMI Attendance Checker
- Daily reset behavior based on the Asia/Manila logical date
- Security headers, robots controls, and immutable caching for hashed assets

The demos use public Supabase publishable keys where browser access is required.
Server-only secrets, database passwords, Netlify tokens, GitHub tokens, and local
`.env` files must stay out of the repository.

## Stack

- Vite-based demo frontends
- Netlify Free for hosting
- Supabase for backend, database, Edge Functions, and scheduled reset jobs
- Cloudflare DNS for demo subdomains under `pauuu.dev`

## Local Setup

Use Node.js 24 LTS and npm 11.

```powershell
npm.cmd install --ignore-scripts
```

Copy `.env.example` into an ignored local env file when a command needs public
demo configuration. Do not place service-role keys or other server secrets in
Vite variables.

## Common Commands

```powershell
npm.cmd run check
npm.cmd run build:apps
npm.cmd audit --audit-level=high
```

Optional live audit:

```powershell
npm.cmd run audit:netlify:live
```

`audit:netlify:live` checks the custom domains by default and requires the
app-specific publishable keys in the environment. Set `DEMO_HOST_MODE=netlify`
to check the original Netlify hostnames instead. The audit does not print or
store key values.

## Demo Safety Rules

- Demo credentials in preview notices are intentional test accounts.
- Default credentials and protected seed data must survive daily resets.
- Visitors must not be able to change protected default credentials.
- CN, RCMI, and Hours use app-specific publishable keys and isolated API routes.
- Payroll and Travels do not persist visitor data.
- Demo pages should stay out of search results through `noindex` and robots
  controls.

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
- Supabase setup/deployment history: `docs/supabase-setup.md` and
  `docs/supabase-deployment.md`
- Preview baseline requirements: `specs/demo-preview-baselines.spec.md`
