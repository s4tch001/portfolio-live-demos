# Phase 4.4 Netlify deployment

Status: complete on 2026-07-22 (Asia/Manila).

## Scope

This subphase created and production-deployed five new, isolated sites on the
Netlify Free plan. It did not modify the account's existing portfolio or older
project sites, configure Cloudflare DNS, attach custom domains, edit the
portfolio repository, or perform Phase 4.5 work.

The deploys are manual and atomic because the user requested one GitHub push
only after the whole phase. Each Netlify site already stores its own public
build settings so a later Git-connected build can use the same app boundary.

| Demo | Netlify URL | Production deploy |
| --- | --- | --- |
| CN Class Management | <https://pauuu-cn-demo.netlify.app> | `6a60374df69da29784c0bd86` |
| RCMI Attendance Checker | <https://pauuu-rcmi-demo.netlify.app> | `6a603790cd99b589dfaa5953` |
| Hours Tracker | <https://pauuu-hours-demo.netlify.app> | `6a60379392d2f445449f55e1` |
| Payroll Splitter | <https://pauuu-payroll-demo.netlify.app> | `6a60378fb33a1846d5d2278d` |
| P Travels | <https://pauuu-travels-demo.netlify.app> | `6a60379d2d011f531d22cc0f` |

## Monorepo and build configuration

Each app has an app-local `netlify.toml`. The repository root remains the build
base, while Netlify's package-directory/filter selection identifies the app.
This preserves access to the shared workspace package without broadening a
site's publish directory. Every publish target is exactly `apps/<app>/dist`.

CN, RCMI, and Hours store only these browser-public build variables in their
own Netlify site, scoped to builds and all deploy contexts:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The publishable key is app-specific (`cn_demo`, `rcmi_demo`, or `hours_demo`).
Payroll and Travels have no backend environment variables. No Supabase secret
key, service-role key, database password, Netlify token, or Cloudflare token is
present in a source file, Netlify config file, committed bundle, or test output.

This setup follows Netlify's documented [monorepo package-directory model](https://docs.netlify.com/build/configure-builds/monorepos/),
[file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/),
and [environment-variable workflow](https://docs.netlify.com/build/environment-variables/overview/).

## Security controls

Every site applies an app-specific Content Security Policy plus these public
preview defaults:

- HTTPS Strict Transport Security
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- same-origin opener isolation
- restrictive permissions and referrer policies
- `X-Robots-Tag` denying indexing, snippets, and image indexing
- one-year immutable caching only for hashed assets
- revalidated/no-cache HTML

CN's theme prepaint code was moved from an inline script to
`/prepaint-theme.js`, allowing `script-src 'self'` without an unsafe-inline
exception. CN and RCMI have explicit SPA rewrites to `/index.html`, consistent
with Netlify's [rewrite guidance](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
Netlify processes the headers and redirects from each app's configuration as
part of the atomic deploy.

The three persistent Supabase Edge Functions now allow both their final
`*-demo.pauuu.dev` hostname and their exact temporary Netlify hostname. Wildcard
origins are not allowed. Deployed versions are CN v7, RCMI v6, and Hours v6.

## Live acceptance evidence

The repeatable `scripts/verify-netlify-live.mjs` audit passed with:

- HTTPS `200` and HTML responses for all five roots;
- CSP, HSTS, anti-framing, `nosniff`, and `noindex` headers on all sites;
- immutable cache headers on a hashed asset from every site;
- working CN `/login` and RCMI `/administrator` SPA deep links;
- successful CN `admin` / `password` login;
- eight or more RCMI fictional seed members available;
- successful Hours `password` login; and
- no publishable-key value written to output.

Separate CORS checks returned `204` with the exact requesting Netlify origin for
all three APIs. A foreign origin remained blocked with `403`.

## Repeatable deploy and verification

Use the pinned Netlify CLI version and the app's recorded site ID. A prebuilt
atomic publish follows this shape:

```powershell
npx.cmd --yes netlify-cli@26.2.0 deploy --prod --no-build `
  --dir "D:\full-stack\P Projects\portfolio live app\apps\cn\dist" `
  --site <recorded-site-id> --filter @pauuu-demo/cn --json
```

For a persistent app, set public variables without putting them in source:

```powershell
npx.cmd --yes netlify-cli@26.2.0 env:set VITE_SUPABASE_URL <public-project-url> `
  --site <recorded-site-id> --filter @pauuu-demo/cn --scope builds --force
npx.cmd --yes netlify-cli@26.2.0 env:set VITE_SUPABASE_PUBLISHABLE_KEY <named-public-key> `
  --site <recorded-site-id> --filter @pauuu-demo/cn --scope builds --force
```

Netlify documents that omitted deploy contexts apply one value to all contexts,
and that environment changes require a new build/deploy to affect generated
frontend code. Only non-sensitive browser values are suitable for Vite.

## Rollback

1. In the affected new demo site's Netlify deploy list, publish the previously
   verified deploy; Netlify deploys are atomic.
2. If a demo must be taken offline, stop only that new `pauuu-*-demo` site. Do
   not alter the existing portfolio or older project sites.
3. If an exact temporary origin must be revoked, remove only that origin from
   its Edge Function allowlist, redeploy the function, and verify that the final
   `*-demo.pauuu.dev` origin remains accepted.
4. Rotate a publishable key only if isolation is in doubt, then update only its
   matching Netlify site and redeploy that app.

## Next gate

Phase 4.5 may proceed only after the next user go signal. It will cover the
Cloudflare-backed `*-demo.pauuu.dev` hostnames. Portfolio edits and the single
end-of-phase GitHub push remain pending.
