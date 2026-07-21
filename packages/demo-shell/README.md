# Shared demo shell

Framework-neutral contracts and a Web Component provide the persistent preview/reset notice for all five demos without adding a runtime dependency.

## Integration

Import the package once in an application entrypoint:

    import "@pauuu-demo/demo-shell";

Place the notice first inside the page body or application root:

    <portfolio-demo-notice project-id="cn"></portfolio-demo-notice>

Supported project ids are cn, rcmi, hours, payroll, and travels. React renders the same custom-element tag; plain HTML apps can import the module through their later build setup.

The component uses Shadow DOM and text nodes only. It adds a robots noindex directive as defense in depth, but every app must also include the same directive statically in its HTML head because crawlers may inspect the document before JavaScript executes.

The visible credentials are intentionally public demo credentials. Server-side and database controls - not the notice - must enforce that they cannot be changed.
