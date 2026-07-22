# Portfolio Live Demos

This workspace contains isolated, resettable demo editions of five portfolio
projects. It remains separate from every original project repository.

Current state: Phase 4.4 is complete. CN Class Management, RCMI
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

Five isolated production previews are live on Netlify Free:

- [CN Class Management](https://pauuu-cn-demo.netlify.app)
- [RCMI Attendance Checker](https://pauuu-rcmi-demo.netlify.app)
- [Hours Tracker](https://pauuu-hours-demo.netlify.app)
- [Payroll Splitter](https://pauuu-payroll-demo.netlify.app)
- [P Travels](https://pauuu-travels-demo.netlify.app)

All five enforce HTTPS security headers, `noindex`, and immutable caching for
hashed assets. The final Cloudflare `*-demo.pauuu.dev` hostnames and portfolio
links remain gated behind the next subphase go signal.

## Local verification

Use Node.js 24 LTS and npm 11:

```powershell
npm.cmd install --ignore-scripts
npm.cmd run check
npm.cmd run build:apps
npm.cmd audit --audit-level=high
```

The optional `npm.cmd run audit:netlify:live` command performs network checks
and requires the three app-specific publishable keys in the environment. It
never prints or stores their values.

Public browser configuration is listed in `.env.example`. Never place a
Supabase secret key, database password, or personal access token in a Vite
variable or browser bundle.

## Project documentation

- Phase 3 completion and verification: `docs/phase-3-completion.md`
- Phase 4.1 Supabase schema deployment: `docs/phase-4-1-supabase-schema-deployment.md`
- Phase 4.2 Supabase Edge API deployment: `docs/phase-4-2-edge-api-deployment.md`
- Phase 4.3 daily reset activation: `docs/phase-4-3-daily-reset-activation.md`
- Phase 4.4 Netlify deployment: `docs/phase-4-4-netlify-deployment.md`
- Phase 3 security review: `docs/security/phase-3-review.md`
- System design: `docs/architecture/system-design.md`
- Daily reset contract: `docs/architecture/reset-contract.md`
- Source isolation rules: `config/source-import-policy.json`
- Supabase setup/deployment history: `docs/supabase-setup.md` and
  `docs/supabase-deployment.md`
- Preview baseline requirements: `specs/demo-preview-baselines.spec.md`
