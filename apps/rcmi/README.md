# RCMI Attendance Checker demo

Isolated Vite/React portfolio adaptation backed by the private `rcmi_demo` schema and `rcmi-api` Supabase Edge Function.

Every reset restores eight fictional leaders, members, and guests plus relative-date attendance. The administrator password is the protected preview value `password`; its hint is visible on the administrator page, its change controls are removed, and both a database trigger and Edge API deny mutation.

Phase 4.1 deployed the `rcmi_demo` schema and reset handler while keeping the application registration disabled. Edge deployment, the named `rcmi` publishable key, reset activation, Netlify configuration, and DNS remain pending.
