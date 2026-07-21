# RCMI Attendance Checker demo

Isolated Vite/React portfolio adaptation backed by the private `rcmi_demo` schema and `rcmi-api` Supabase Edge Function.

Every reset restores eight fictional leaders, members, and guests plus relative-date attendance. The administrator password is the protected preview value `password`; its hint is visible on the administrator page, its change controls are removed, and both a database trigger and Edge API deny mutation.

Phase 3 keeps the app registration disabled. Remote migration, Edge deployment, the named `rcmi` publishable key, reset activation, Netlify configuration, and DNS belong to Phase 4.
