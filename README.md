# Portfolio Live Demos

This public workspace contains isolated, resettable demo editions of five
portfolio projects. It remains separate from every original project repository
and is safe to publish because it does not commit Supabase secret keys,
database passwords, Netlify tokens, GitHub tokens, or local `.env` files.

Current state: Phase 4.5 is complete. CN Class Management, RCMI
Attendance Checker, Hours Tracker, Payroll Splitter, and P Travels each have a
buildable demo workspace, persistent preview notice, `noindex` protection, and
an app-specific reset contract. CN and RCMI restore fictional sample records;
CN, RCMI, and Hours enforce immutable default credentials at UI, API, and
database layers. Payroll and Travels persist no visitor data.

All five app-schema migrations are deployed to the dedicated Supabase project
and remote lint reports zero errors. The `cn-api`, `rcmi-api`, and `hours-api`
Edge Functions are active behind their exact app-specific publishable keys and
have passed live authentication, key-isolation, CORS, sample-data, and immutable
credential checks. Vault-backed Supabase Cron is active every 15 minutes and
performs each app's idempotent daily reset using the Asia/Manila logical date.

Five isolated production previews are live on Netlify Free through DNS-only
Cloudflare subdomains:

- [CN Class Management](https://cn-demo.pauuu.dev)
- [RCMI Attendance Checker](https://rcmi-demo.pauuu.dev) — open `/administrator` manually for the administrator panel
- [Hours Tracker](https://hours-demo.pauuu.dev)
- [Payroll Splitter](https://payroll-demo.pauuu.dev)
- [P Travels](https://travels-demo.pauuu.dev)

All five enforce HTTPS security headers, `noindex`, and immutable caching for
hashed assets. The shared preview notice now publishes its measured responsive
height so fixed navigation, loading layers, gates, and overlays always start
below it. Portfolio edits remain gated behind the next subphase go signal.

## Local verification

Use Node.js 24 LTS and npm 11:

```powershell
npm.cmd install --ignore-scripts
npm.cmd run check
npm.cmd run build:apps
npm.cmd audit --audit-level=high
```

The optional `npm.cmd run audit:netlify:live` command checks the custom domains
by default and requires the three app-specific publishable keys in the
environment. Set `DEMO_HOST_MODE=netlify` to check the original Netlify
hostnames instead. The audit never prints or stores key values.

Public browser configuration is listed in `.env.example`. Supabase publishable
keys are browser-facing by design; Supabase secret keys, database passwords,
Netlify tokens, GitHub tokens, and personal access tokens must stay in provider
dashboards, CLI secret stores, or ignored local `.env` files. Never place a
server-only secret in a Vite variable or browser bundle.

## Public repository safety

- Demo credentials shown in the preview notices are intentional, non-sensitive
  test accounts for visitors.
- Visitor-created records are reset daily; protected seed data is restored after
  each reset.
- Search indexing is disabled for the demo subdomains with `noindex` controls.
- `.env.example` contains placeholders only. Copy it to an ignored local file or
  configure values directly in Netlify/Supabase when deploying.

## Project documentation

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
