# Shared demo shell

Framework-neutral contracts and a Web Component provide the persistent preview/reset notice for all five demos without adding a runtime dependency.

## Integration

Import the package once in an application entrypoint:

    import "@pauuu-demo/demo-shell";

Place the notice first inside the page body or application root:

    <portfolio-demo-notice project-id="cn"></portfolio-demo-notice>

Supported project ids are cn, rcmi, hours, payroll, and travels. React renders the same custom-element tag; plain HTML apps can import the module through their later build setup.

The component uses Shadow DOM and text nodes only. It adds a robots noindex directive as defense in depth, but every app must also include the same directive statically in its HTML head because crawlers may inspect the document before JavaScript executes.

The notice identifies fictional baseline records that return after reset and identifies Netlify as the demo frontend host plus Supabase as the demo backend/database. These labels distinguish the disposable preview from any production deployment shown on the portfolio.

The visible credentials are intentionally public demo credentials. Server-side and database controls - not the notice - must enforce that they cannot be changed.

CN uses `admin/password` as its non-master administrator. `devpau` is intentionally not a demo credential and must remain a reserved, non-creatable master username in the CN adapter.

Persistent baseline data and Payroll Splitter interaction requirements are exported from `./baselines`. The baseline records use stable keys and relative Manila-day offsets so future reset migrations can restore useful examples idempotently.
