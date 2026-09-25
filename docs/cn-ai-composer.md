# CN demo AI Composer

The CN Class Management demo includes a teacher-facing **Compose Class Report → AI Composer**. Teachers enter rough notes, generate an English feedback draft, review or edit it, then copy it into the report form. The draft is not filed automatically.

The feature is live at <https://cn-demo.pauuu.dev>. The site is the `balisong-cn-demo` project in the separate `balisong` Netlify team and deploys from the `main` branch of `s4tch001/portfolio-live-demos`. The project's Netlify build uses the repository-root `netlify.toml`: it builds `@pauuu-demo/cn`, publishes `apps/cn/dist`, and serves the Function in `apps/cn/netlify/functions`. The original Netlify team still hosts RCMI, Hours, Payroll, and Travels. The CN subdomain points to the new CN project; the portfolio root domain is hosted on Vercel.

## How a request works

1. The browser sends notes, the selected schedule ID, and class duration to `/api/ai/compose-report` on the CN site.
2. The Netlify Function checks the request shape and size, then sends the request to the fixed CN Supabase Edge API endpoint. The browser cannot choose the upstream URL.
3. The Edge API requires an authenticated admin or teacher session. A teacher may compose only for an assigned schedule. It removes known student and teacher names from the notes and atomically claims the generation quota in Postgres.
4. After those checks pass, the Netlify Function calls `gpt-4o-mini` through Netlify AI Gateway. Netlify supplies the Gateway credentials to the server-side Function at runtime; they are not bundled into Vite or sent to the browser.
5. The Function returns a formatted draft. The teacher can review, edit, and copy it. The normal report form saves it only when the teacher submits the report.

The demo uses fictional school data. Known student and teacher names in notes are replaced with placeholders before the model request and restored in the returned report. Other details in free-form notes still go to Netlify AI Gateway. Do not enter real student, teacher, or school information.

## Demo limits

- 10 generations per admin or teacher account per UTC day.
- 30 generations shared across the demo per UTC day.
- At least five seconds between generations from the same account.
- The daily period resets at 00:00 UTC (08:00 in Manila).
- A quota is claimed before the model call, so a provider failure after the claim still uses one generation.

The server enforces limits atomically in Postgres. Old usage rows are pruned during quota claims. These are demo abuse limits; Netlify AI Gateway usage is also subject to the team's Netlify plan and credits.

## Implementation and deployment

Relevant files:

- `apps/cn/src/pages/ReportsPage/AiComposerModal.jsx` — notes, usage display, draft review, and copy action.
- `apps/cn/netlify/functions/ai-compose-report.mjs` — validates requests and calls Netlify AI Gateway.
- `supabase/functions/cn-api/index.ts` — session, schedule-ownership, and quota checks.
- `supabase/functions/cn-api/ai-composer.ts` — prompt rules, name masking, and report formatting.
- `supabase/migrations/20260925000100_cn_ai_composer_quota.sql` — atomic per-account and shared quotas.

The quota migration and updated `cn-api` are deployed to the dedicated demo Supabase project. Public build variables are configured in the Netlify site. Keep Gateway credentials in Netlify's Function runtime; never add them to a Vite variable, `.env` committed to Git, or browser code.

The Netlify Git integration builds changes to the CN app from `main`; pushes to this repository also trigger the other app sites when their configured per-app ignore rules detect relevant changes. A local commit does not change the live site until it is pushed and its Netlify deploy succeeds.

## Local development

Run the CN local app and its isolated local Supabase database with:

```powershell
npm.cmd run dev:cn-local
```

This supports UI and API development against the local demo backend. The production Gateway credentials are managed by Netlify; a plain Vite server does not run the Netlify Function. When running the Function with `netlify dev` against a local Supabase backend, set `CN_DEMO_LOCAL_API_URL` to `http://127.0.0.1:54321/functions/v1/cn-api`. The Function accepts only a loopback HTTP URL for this override.
