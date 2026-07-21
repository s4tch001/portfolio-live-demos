# Payroll Splitter demo

An isolated, client-side portfolio preview of the Payroll Splitter. Values are
kept only in the active browser page and are never written to Supabase. Its
registered daily database reset handler is therefore intentionally a bounded
no-op.

Dependent hours are calculated only when the edited Total Hours or person
hours field loses focus, so a visitor can finish typing before the final field
is derived.
