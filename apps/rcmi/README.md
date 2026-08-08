# RCMI Attendance Checker demo

Isolated Vite/React portfolio adaptation backed by the private `rcmi_demo` schema and `rcmi-api` Supabase Edge Function.

Every reset restores a fictional directory of leaders, members, and guests plus current-month attendance. Wednesday and Sunday attendance appears only after each Manila service date has ended. The administrator password is the protected preview value `password`; its hint is visible on the administrator page, its change controls are removed, and both a database trigger and Edge API deny mutation. The persistent preview notice tells visitors to open the unlinked `/administrator` route manually.

The live preview uses the exact `rcmi_demo` publishable key, restores its fictional baseline daily, and is deployed through Netlify and the DNS-only `rcmi-demo.pauuu.dev` Cloudflare hostname.
