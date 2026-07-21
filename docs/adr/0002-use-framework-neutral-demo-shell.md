# ADR 0002: Use a framework-neutral demo shell

- Status: Accepted
- Date: 2026-07-21

## Context

All previews need the same persistent warning, reset timing, public credential hints, and crawler directives. The imported applications may not share one frontend framework.

## Decision

Publish the shared behavior as an internal ES module and Web Component named `portfolio-demo-notice`. Store immutable per-project contracts in the same package. Render user-visible values with DOM text nodes inside Shadow DOM, and install a runtime robots directive while requiring a static directive in each application HTML file.

## Consequences

- React, Vite, and plain HTML applications can use the same contract without framework adapters.
- Shadow DOM limits style collisions with copied applications.
- Text-only rendering avoids HTML injection sinks for contract values.
- Each application still needs a small integration step and must place the banner where it remains visible.
- The notice is informational; server and database controls remain responsible for credential protection.

## Alternatives considered

- Reimplement the banner in every framework: creates drift in wording, credentials, and reset behavior.
- Embed a shared iframe: adds focus, sizing, origin, and accessibility complexity.
- Use only a host-level redirect or splash page: the warning would disappear after visitors enter the application.
