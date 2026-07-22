# Phase 4.5 custom domains and notice layout

Status: complete on 2026-07-22 (Asia/Manila).

## Scope

This subphase attached one public `pauuu.dev` hostname to each isolated
Netlify Free demo, created only the five matching Cloudflare DNS records, and
fixed every full-screen or fixed-position demo layer that could overlap the
responsive preview notice. It did not edit the portfolio repository, alter the
apex domain, replace any unrelated DNS record, or push the phase commits.

| Demo | Public preview | DNS-only CNAME target | Netlify deploy |
| --- | --- | --- | --- |
| CN Class Management | <https://cn-demo.pauuu.dev> | `pauuu-cn-demo.netlify.app` | `6a6054c6d330aa5768689105` |
| RCMI Attendance Checker | <https://rcmi-demo.pauuu.dev> | `pauuu-rcmi-demo.netlify.app` | `6a60518f84e5b89872299d37` |
| Hours Tracker | <https://hours-demo.pauuu.dev> | `pauuu-hours-demo.netlify.app` | `6a603d7c20b6dd6e5c0447d1` |
| Payroll Splitter | <https://payroll-demo.pauuu.dev> | `pauuu-payroll-demo.netlify.app` | `6a603d7e84e5b83c59299ee8` |
| P Travels | <https://travels-demo.pauuu.dev> | `pauuu-travels-demo.netlify.app` | `6a603d7e3df0e40c295441dd` |

All records use Cloudflare's automatic TTL and are DNS-only. Netlify documents
that an externally managed subdomain should be added to its site first and
then configured as a CNAME to the site's `netlify.app` hostname. Cloudflare
documents CNAME creation in the zone's DNS Records page. No paid service or
plan upgrade is required.

- Netlify: <https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/>
- Cloudflare: <https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/>

## Responsive notice offset

The shared `<portfolio-demo-notice>` measures its rendered height, publishes it
as `--portfolio-demo-notice-height`, and updates the value through
`ResizeObserver`. This handles both desktop and wrapped mobile notice content.
The value is consumed by:

- the P Travels fixed navbar and mobile dropdown;
- the Hours password gate and full-screen overlays;
- the RCMI modal and busy overlays; and
- the CN authenticated app-shell height plus its loading, maintenance,
  authentication, toolbar, public-header, and notification layers.

RCMI's notice also tells visitors that the unlinked administrator panel must be
opened manually at `/administrator`. The hint is visible without exposing any
additional credential or privileged route.

The corrected builds were checked at 1280 x 800 and 390 x 844. Each demo had
zero notice overlap. On mobile, the P Travels notice ended at 174 px, the
navbar started at 174 px, and its dropdown started below the 64 px navbar at
238 px.

A follow-up CN shell hotfix removed the duplicate notice offset from the
authenticated navigation and sized the app to the viewport space remaining
below the notice. At 1280 x 800, the notice ended at 103 px, navigation occupied
103–155 px, and the scrollable content began at 155 px. At 390 x 844, the
notice ended at 213 px, navigation occupied 213–265 px, its tabs stayed within
222–255 px, and the content began at 265 px. Accounts, Schedule, Reports,
Tracker, and Classes all passed these checks with no browser console errors.

## Security and live acceptance

The custom hosts retain the same CSP, HSTS, anti-framing, `nosniff`, `noindex`,
and immutable hashed-asset caching verified in Phase 4.4. CN, RCMI, and Hours
accept only their exact custom hostname or their exact Netlify hostname as a
CORS origin; wildcard origins remain prohibited. The repeatable custom-host
audit checks HTTPS roots, security headers, immutable assets, SPA fallbacks,
CN default-admin login, RCMI sample members, and Hours default-password login.

Run it with the three named public keys in the environment:

```powershell
npm.cmd run audit:netlify:live
```

To audit the retained Netlify hostnames instead:

```powershell
$env:DEMO_HOST_MODE = 'netlify'
npm.cmd run audit:netlify:live
Remove-Item Env:DEMO_HOST_MODE
```

No publishable-key value is printed or committed.

## Rollback

1. Remove only the affected `*-demo` CNAME record from Cloudflare.
2. Remove only the matching custom domain from the new `pauuu-*-demo` Netlify
   site; do not touch an older production site.
3. The verified `pauuu-*-demo.netlify.app` hostname remains available as a
   fallback.
4. Publish the previous Netlify deploy if the layout build itself must be
   rolled back.

## Next gate

Portfolio integration and the remaining Phase 4 work may proceed only after
the user's next go signal. The portfolio repository remains unchanged in this
subphase.
