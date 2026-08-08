# Hours Tracker demo

An isolated portfolio preview of the Hours Tracker. It talks only to the
dedicated `hours-api` Supabase Edge Function and never includes the original
project URL, key, or mutable settings endpoint.

Local development requires `VITE_SUPABASE_URL` and the named
`VITE_SUPABASE_PUBLISHABLE_KEY` for the Hours preview. Visitor hours are
deleted by the daily Manila-time reset. The server-verified preview password
is immutable and is restored independently of visitor data. Each new session
receives fictional entries only for weekdays that have already ended in the
current Manila month, so the sample history advances after midnight.

Phase 4.2 deployed `hours-api` behind the exact `hours_demo` publishable key and
verified authenticated entry reads plus immutable password enforcement. The
reset registration remains disabled; reset activation, Netlify configuration,
and DNS remain pending.
