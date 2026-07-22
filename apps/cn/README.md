# CN demo

Isolated portfolio adaptation of the CN Class Management project. The Vite/React frontend is copied from the explicit source allowlist and connected to the private `cn_demo` schema through the `cn-api` Supabase Edge Function.

The preview seeds fictional teachers, students, relative-date schedules, reports, receipts, balances, and usage. Its public credentials are `admin/password`, `testteacher/password`, and `teststudent/password`. Database triggers and the API prevent changes to those credentials, reject the reserved `devpau` username, and deny Permissions, Dev Tools, Security, and backup operations.

Phase 4.2 deployed `cn-api` behind the exact `cn_demo` publishable key and verified all three preview logins, fictional baseline data, restricted-route denial, and immutable credentials. The reset registration remains disabled; reset activation, Netlify configuration, and DNS remain pending.
