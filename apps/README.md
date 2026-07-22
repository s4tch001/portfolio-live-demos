# App workspaces

Phase 3 contains five isolated portfolio demo applications:

| Workspace | Runtime | Persistent visitor data |
| --- | --- | --- |
| `cn` | React/Vite + `cn-api` | Private app schema and bounded CN Storage uploads |
| `rcmi` | React/Vite + `rcmi-api` | Private directory and attendance schema |
| `hours` | Vanilla/Vite + `hours-api` | Session-isolated hour entries |
| `payroll` | Vanilla/Vite | None; calculations remain in the page |
| `travels` | React/Vite | None; static showcase |

Every app imports `@pauuu-demo/demo-shell`, ships static `noindex` metadata,
and has a private daily reset handler contract. Payroll and Travels handlers
are explicit no-ops because those pages do not persist visitor values.

From the workspace root, run `npm run build:apps` and `npm run check`.
Frontend environment values are documented in `.env.example`. The five app
schemas and reset handlers were deployed in Phase 4.1. Phase 4.2 deployed the
CN, RCMI, and Hours Edge APIs behind exact app-specific publishable keys and
completed live security checks. Every reset registration remains disabled;
Netlify sites, custom domains, reset activation, and portfolio links remain
gated behind later Phase 4 subphases.
