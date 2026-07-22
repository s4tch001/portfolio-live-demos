# RCMI Attendance Checker demo

Isolated Vite/React portfolio adaptation backed by the private `rcmi_demo` schema and `rcmi-api` Supabase Edge Function.

Every reset restores eight fictional leaders, members, and guests plus relative-date attendance. The administrator password is the protected preview value `password`; its hint is visible on the administrator page, its change controls are removed, and both a database trigger and Edge API deny mutation.

Phase 4.2 deployed `rcmi-api` behind the exact `rcmi_demo` publishable key and verified the eight-member fictional baseline, administrator login, and immutable password. The reset registration remains disabled; reset activation, Netlify configuration, and DNS remain pending.
