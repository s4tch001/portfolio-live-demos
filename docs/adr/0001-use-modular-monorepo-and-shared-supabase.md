# ADR 0001: Use a modular monorepo and shared Supabase project

- Status: Accepted
- Date: 2026-07-21

## Context

Five existing projects need separately deployable previews while all new work stays isolated from their source folders. The complete setup must remain free-only. Supabase Free project limits make one backend project preferable, but the applications must not gain accidental access to each other's data.

## Decision

Use one private npm workspace repository containing five application workspaces and reusable packages. Use one dedicated Supabase project, with an explicit schema, grants, RLS policies, reset function, and Storage namespace for each application. Deny cross-app privileges by default.

## Consequences

- Shared checks, contracts, and deployment conventions remain consistent.
- Each frontend can still deploy independently to its own Netlify site and subdomain.
- One database project lowers cost and administration overhead.
- The project is a shared failure and quota boundary, so schema separation, least-privilege grants, and cross-app isolation tests are mandatory.
- An application can be split into a separate Supabase project later if traffic or risk justifies a paid or multi-project design.

## Alternatives considered

- Separate repository and Supabase project per preview: stronger operational isolation, but conflicts with the free-only constraint and duplicates platform work.
- One public schema for all apps: simpler initially, but makes grants, naming, and reset blast radius harder to reason about.
- Modify the original repositories directly: rejected because the user requires original code to remain unchanged.
