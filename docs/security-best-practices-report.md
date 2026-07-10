# Security best-practices review

Review date: 2026-07-10  
Scope: Astro/TypeScript frontend, React-based server-rendered icons, build-time Meetup and RSS ingestion, GitHub Actions, and Cloudflare Pages output

## Executive summary

No critical or high-severity issue was found. Three medium-severity gaps were remediated in this PR: missing browser security headers, unvalidated remote feed/event URLs, and unsafe serialization at the inline JSON-LD boundary. One accepted low-severity dependency remains: the existing Google Tag Manager container executes third-party JavaScript in the site origin.

The live production response was independently sampled before this PR. It included `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, but did not include CSP, HSTS, clickjacking protection, or Permissions Policy. The build now generates Cloudflare Pages `_headers` rules with route-specific hashes for every inline script. These headers must be verified again on the production URL after merge.

The Cloudflare preview for this PR was also checked after deployment. It returned the generated CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers; the page loaded GTM without CSP or runtime console errors.

The Cloudflare report mentioned for this review was not present in the workspace or controllable browser session. Its findings still need to be reconciled when the report is attached or pasted.

## Medium-severity findings (remediated)

### SEC-001 — Missing browser security-header baseline

- Rule ID: `REACT-HEADERS-001`, `REACT-CSP-001`
- Severity: Medium
- Location: `scripts/security-headers.mjs`, `buildContentSecurityPolicy` and `writeCloudflareHeaders`, lines 22–85
- Evidence: the pre-PR production response lacked CSP, HSTS, `X-Frame-Options`, and `Permissions-Policy`. The new build hook writes those headers and a per-route CSP containing SHA-256 hashes for inline scripts. `script-src-attr` and `style-src-attr` are set to `none`; neither `unsafe-inline` nor `unsafe-eval` is used.
- Impact: without these controls, a separate injection defect would have fewer browser-enforced limits, and the page could be framed by another origin.
- Fix: generate Cloudflare `_headers` after Astro has finalized each HTML page so the policy hashes exactly match the output.
- Mitigation: keep output escaping and URL validation as the primary controls; CSP remains defense in depth.
- False positive notes: Cloudflare settings can add headers outside the repository, but the sampled live response confirmed that the missing headers were not being added at the edge.

### SEC-002 — Remote feed and event URLs were not constrained before rendering

- Rule ID: `REACT-URL-001`
- Severity: Medium
- Location: `scripts/lib/community-feed-reader.mjs`, `loadMemberFeeds`, `isHttpUrl`, and `normalizeNotifierItem`, lines 17–76 and 257–286; `scripts/fetch-feeds.mjs`, media normalization, lines 76–113 and item normalization, lines 404–445; `src/lib/meetup-events.ts`, `isMeetupEvent`, lines 98–117
- Evidence: member feed items and Meetup data cross a remote-data trust boundary and supply link/image attributes. Normalization now accepts only HTTP(S), rejects active schemes such as `javascript:` and `data:`, and falls back to the approved source URL when an item link is invalid. Rendering applies a second HTTP(S) check to cached feed JSON.
- Impact: compromise or malformed output from an approved feed could previously create an active-scheme link that executed when a visitor selected it.
- Fix: validate schemes both when sources are loaded and when remote items are normalized; retain render-time validation for stale cache defense.
- Mitigation: the hash-based CSP also blocks inline script execution and script attributes.
- False positive notes: current approved feeds emit HTTPS links, so exploitation required a compromised or malicious upstream. The validation is retained because upstream content is not a trusted code boundary.

### SEC-003 — Inline JSON-LD needed script-context escaping

- Rule ID: `REACT-XSS-001`, `REACT-DOM-001`
- Severity: Medium
- Location: `src/lib/structured-data.ts`, `serializeJsonLd`, lines 67–71; `src/layouts/Layout.astro`, JSON-LD output, line 196
- Evidence: upcoming event fields originate in a remote Meetup response and are serialized inside a `<script type="application/ld+json">` element. The serializer now escapes `<` and JavaScript line separators before `set:html` writes the JSON.
- Impact: a literal `</script>` sequence in remote text could otherwise terminate the data block and create executable markup in the generated page.
- Fix: centralize JSON-LD serialization and test a closing-script payload.
- Mitigation: the generated CSP permits only the exact build-time hash of the final JSON-LD block.
- False positive notes: modifying event content requires organizer-level Meetup access, but remote content is still treated as untrusted at the HTML boundary.

## Low-severity findings

### SEC-004 — Google Tag Manager remains a privileged third party

- Rule ID: `REACT-3P-001`, `REACT-SRI-001`
- Severity: Low
- Location: `src/layouts/Layout.astro`, GTM bootstrap, lines 27–33 and 162–164
- Evidence: the existing GTM container loads JavaScript from `www.googletagmanager.com`. SRI is not practical for the mutable GTM endpoint.
- Impact: a compromised account, container, or vendor response can execute code with the page origin's privileges.
- Fix: no dependency was added; retain GTM because the roadmap explicitly requires the existing integration. Limit container publishing access and review every tag/version before publication.
- Mitigation: CSP limits scripts to the site origin, exact inline hashes, and `www.googletagmanager.com`; analytics payloads contain only stable event, destination, and placement labels.
- False positive notes: this is an accepted integration risk, not evidence that the current container is compromised.

## Confirmed controls

- `npm audit` reported zero known vulnerabilities across the current dependency tree on 2026-07-10.
- `package-lock.json` is committed, and pull-request CI uses `npm ci` (`.github/workflows/build.yml`, lines 17–30).
- No public source maps are emitted by the production build.
- No auth tokens or session identifiers are stored in Web Storage; the site has no authenticated browser session or state-changing API.
- External links opened in a new tab use `rel="noreferrer"`.
- Google Maps is linked on demand; no Maps script or iframe loads with the page.

## Post-merge verification

1. Re-run `curl -I https://kyototechmeetup.com/` and `/ja/` after Cloudflare deploys the merge.
2. Confirm CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` are present.
3. Browse both locale routes with the console open and confirm there are no CSP violations from the approved GTM/GA configuration.
4. Reconcile the separate Cloudflare report when it is supplied; record any edge-only settings or remaining findings here.
