# Portfolio Live Demos

This workspace will contain isolated, resettable demo editions of five portfolio projects. It is intentionally separate from every original project repository.

Current state: Phase 1, Sub-phase 1.3 — a dedicated Free Supabase project and secure local CLI baseline are configured. No application source, production data, or secret-bearing environment file has been imported.

The source-copy rules are defined in config/source-import-policy.json. Run npm run check before and after every future import or migration.

Node.js 24 LTS and npm 11 are the supported toolchain. See docs/toolchain.md for the local and CI workflow.

Supabase project identity and dashboard security choices are recorded in config/supabase-project.json. App schemas, grants, policies, reset functions, and fictional seed records will be added only in their approved later phases.
