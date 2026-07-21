# Portfolio Live Demos

This workspace will contain isolated, resettable demo editions of five portfolio projects. It is intentionally separate from every original project repository.

Current state: Phase 2 is complete. The shared architecture, amended preview hints, CN access rules, persistent fictional CN/RCMI baseline contracts, and Payroll hours interaction behavior are defined. The private reset-control migration and authenticated coordinator are deployed to the dedicated Supabase preview project, but all five application handlers remain disabled and no reset schedule exists yet. No application source, production data, or secret-bearing environment file has been imported.

The source-copy rules are defined in config/source-import-policy.json. Run npm run check before and after every future import or migration.

Node.js 24 LTS and npm 11 are the supported toolchain. See docs/toolchain.md for the local and CI workflow.

Supabase project identity and dashboard security choices are recorded in config/supabase-project.json. App-specific schemas, grants, policies, reset handlers, and fictional seed migrations will be added only in their approved later phases.

The sanitized Phase 2 deployment record is in docs/supabase-deployment.md. It contains no API keys, request identifiers, cookies, or credentials.

The approved platform architecture and reset behavior are documented in docs/architecture/system-design.md and docs/architecture/reset-contract.md. Significant decisions are recorded under docs/adr.

The approved persistent sample-data, CN restricted-access, portfolio-labeling, and Payroll blur-calculation requirements are documented in specs/demo-preview-baselines.spec.md.
