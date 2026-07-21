# Hours Tracker demo

An isolated portfolio preview of the Hours Tracker. It talks only to the
dedicated `hours-api` Supabase Edge Function and never includes the original
project URL, key, or mutable settings endpoint.

Local development requires `VITE_SUPABASE_URL` and the named
`VITE_SUPABASE_PUBLISHABLE_KEY` for the Hours preview. Visitor hours are
deleted by the daily Manila-time reset. The server-verified preview password
is immutable and is restored independently of visitor data.
