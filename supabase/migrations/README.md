# Migrations

`20260722000100_demo_reset_control.sql` defines the private orchestration state, leased/idempotent transitions, and five service-role-only RPC wrappers. It deliberately leaves every application disabled until that application's schema and reset handler are implemented in a later approved sub-phase.

Migrations must remain deterministic and contain fictional demo configuration/data only. Remote application is a separate, user-approved deployment step.
