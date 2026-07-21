# Portfolio Live Demos

This workspace contains isolated, resettable demo editions of five portfolio
projects. It remains separate from every original project repository.

Current state: Phase 3 is complete locally. CN Class Management, RCMI
Attendance Checker, Hours Tracker, Payroll Splitter, and P Travels each have a
buildable demo workspace, persistent preview notice, `noindex` protection, and
an app-specific reset contract. CN and RCMI restore fictional sample records;
CN, RCMI, and Hours enforce immutable default credentials at UI, API, and
database layers. Payroll and Travels persist no visitor data.

The Phase 3 migrations and app Edge Functions have **not** been deployed. All
five applications remain disabled in the existing remote reset registry, and
no Cron schedule, Netlify site, custom domain, or portfolio link has been
created. Those are Phase 4 tasks and require the user's next go signal.

## Local verification

Use Node.js 24 LTS and npm 11:

```powershell
npm.cmd install --ignore-scripts
npm.cmd run check
npm.cmd run build:apps
npm.cmd audit --audit-level=high
```

Public browser configuration is listed in `.env.example`. Never place a
Supabase secret key, database password, or personal access token in a Vite
variable or browser bundle.

## Project documentation

- Phase 3 completion and verification: `docs/phase-3-completion.md`
- Phase 3 security review: `docs/security/phase-3-review.md`
- System design: `docs/architecture/system-design.md`
- Daily reset contract: `docs/architecture/reset-contract.md`
- Source isolation rules: `config/source-import-policy.json`
- Supabase setup/deployment history: `docs/supabase-setup.md` and
  `docs/supabase-deployment.md`
- Preview baseline requirements: `specs/demo-preview-baselines.spec.md`
