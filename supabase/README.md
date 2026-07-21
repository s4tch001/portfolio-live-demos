# Demo-only Supabase

This directory contains the reviewed local configuration, migrations, seed file, and server-side functions for one dedicated demo project. No credentials or production data belong here.

The Phase 1.3 baseline disables public signups, anonymous login, SMS signup, and automatic pooler exposure; caps local API responses at 500 rows; and caps local Storage files at 2 MiB.

Phase 2.2 adds a private, RLS-enabled reset-control schema and a service-to-service Edge coordinator. Phase 2.4 deploys that foundation to the dedicated preview project. All five applications are registered but disabled and not resettable until a later app migration installs and enables its reviewed `reset_demo_data(date)` handler. No Cron schedule exists yet.
