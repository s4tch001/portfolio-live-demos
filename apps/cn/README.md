# CN demo

Isolated portfolio adaptation of the CN Class Management project. The Vite/React frontend is copied from the explicit source allowlist and connected to the private `cn_demo` schema through the `cn-api` Supabase Edge Function.

The preview seeds fictional teachers, students, current-month schedules, reports, receipts, balances, and usage. Schedules cover the Manila month; reports and charged usage appear only after each schedule date has ended in Manila. Its public credentials are `admin/password`, `testteacher/password`, and `teststudent/password`. Database triggers and the API prevent changes to those credentials, reject the reserved `devpau` username, and deny Permissions, Dev Tools, Security, and backup operations.

The teacher **Compose Class Report → AI Composer** drafts English feedback from teacher notes using `gpt-4o-mini` through Netlify AI Gateway. A server-side Netlify Function and `cn-api` validate the session and schedule before making a request. Generated text stays in the composer until the teacher reviews and copies it into the report. The demo limits each teacher/admin account to 10 generations per UTC day, with a 30-generation shared daily cap and a five-second cooldown. Avoid entering real student or school information; see [`docs/cn-ai-composer.md`](../../docs/cn-ai-composer.md) for request handling and privacy details.

Live demo: [cn-demo.pauuu.dev](https://cn-demo.pauuu.dev). It is deployed from this repository's `main` branch to the `balisong-cn-demo` Netlify project in the separate `balisong` team. Netlify hosts the frontend and AI Function; the private demo data remains in Supabase. The other four demo sites are still hosted by the original Netlify team.
