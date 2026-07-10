# Security best-practices review

Review date: 2026-07-10  
Scope: Astro/TypeScript frontend, React-based server-rendered icons, build-time Meetup and RSS ingestion, GitHub Actions, and Cloudflare Pages output

## Executive summary

No critical or high-severity application issue was found. Three medium-severity application gaps were remediated in this PR: missing browser security headers, unvalidated remote feed/event URLs, and unsafe serialization at the inline JSON-LD boundary. One accepted low-severity dependency remains: the existing Google Tag Manager container executes third-party JavaScript in the site origin.

The live production response was independently sampled before this PR. It included `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, but did not include CSP, HSTS, clickjacking protection, or Permissions Policy. The build now generates Cloudflare Pages `_headers` rules with route-specific hashes for every inline script. These headers must be verified again on the production URL after merge.

The Cloudflare preview for this PR was also checked after deployment. It returned the generated CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers; the page loaded GTM without CSP or runtime console errors.

The Cloudflare Security Insights export dated 2026-07-10 was reconciled in full. It contains six active insights: one confirmed dangling wildcard DNS record, two confirmed email-authentication gaps, one repository-owned `security.txt` gap remediated in this PR, and two optional AI-crawler policy suggestions. The wildcard record should be handled first because an arbitrary subdomain currently resolves through Cloudflare to an inactive origin.

## Cloudflare Security Insights reconciliation

### CF-001 — Dangling wildcard A record

- Rule ID: `CLOUDFLARE-DANGLING-A`
- Cloudflare severity: Moderate
- Status: Confirmed; Cloudflare account action required
- Location: Cloudflare DNS, wildcard host `*.kyototechmeetup.com`
- Evidence: on 2026-07-10, `codex-security-check-20260710.kyototechmeetup.com` resolved to Cloudflare proxy addresses `104.21.35.61` and `172.67.214.85`. An HTTPS request reached Cloudflare but returned `522`, independently matching the report's inactive-origin finding.
- Impact: if the wildcard points at a claimable abandoned resource, an attacker may be able to serve content from a trusted `kyototechmeetup.com` subdomain. Even when takeover is not currently possible, the wildcard exposes unintended hostnames and routes them to a broken origin.
- Required fix: in Cloudflare DNS, remove the `*` A record if wildcard subdomains are not deliberately used. If they are required, replace the target with an active, verified resource and configure explicit host handling at that origin.
- Verification: after DNS propagation, `dig +short A <random-label>.kyototechmeetup.com` must return no result. Known, explicitly configured hosts must continue to resolve.
- False positive notes: public DNS exposes Cloudflare proxy addresses rather than the origin address, but arbitrary-label resolution plus the `522` response confirms the wildcard is active and the routed origin is unavailable.

### CF-002 — SPF record missing

- Rule ID: `CLOUDFLARE-SPF`
- Cloudflare severity: Moderate
- Status: Confirmed; DNS action required
- Location: Cloudflare DNS, TXT record at `kyototechmeetup.com`
- Evidence: the apex has MX record `10 mx.hover.com.cust.hostedemail.com.` but returned no TXT record on 2026-07-10.
- Impact: receiving mail systems cannot verify which servers may send mail for the domain, increasing spoofing risk and potentially reducing delivery reliability.
- Required fix: add one TXT record at the root (`@`) with Hover's documented Hosted Email policy: `v=spf1 include:_spf.hostedemail.com ~all`.
- Verification: `dig +short TXT kyototechmeetup.com` must return exactly one SPF policy containing the Hover include. Send test mail through every legitimate sender before considering a stricter `-all` policy.
- Source: [Hover — Understanding Gmail, Microsoft and Yahoo DMARC requirements](https://support.hover.com/support/solutions/articles/201000064593-understanding-gmail-microsoft-and-yahoo-dmarc-requirements-for-hover-email)

### CF-003 — DMARC record missing

- Rule ID: `CLOUDFLARE-DMARC`
- Cloudflare severity: Low
- Status: Confirmed; DNS action required
- Location: Cloudflare DNS, TXT record at `_dmarc.kyototechmeetup.com`
- Evidence: `_dmarc.kyototechmeetup.com` returned no TXT record on 2026-07-10 while the domain has an active Hover MX record.
- Impact: domain owners receive no DMARC enforcement or reporting, and receivers lack a domain-level policy for messages that fail SPF/DKIM alignment.
- Required fix: begin with Hover's documented monitoring policy by adding TXT host `_dmarc` with `v=DMARC1; p=none;`. Add an aggregate-report address (`rua`) only when a controlled mailbox has been selected; do not publish a personal address by default. Review reports before moving to `quarantine` or `reject`.
- Verification: `dig +short TXT _dmarc.kyototechmeetup.com` must return one syntactically valid DMARC policy.
- Source: [Hover — Understanding Gmail, Microsoft and Yahoo DMARC requirements](https://support.hover.com/support/solutions/articles/201000064593-understanding-gmail-microsoft-and-yahoo-dmarc-requirements-for-hover-email)

### CF-004 — Security contact file missing

- Rule ID: `CLOUDFLARE-SECURITY-TXT`
- Cloudflare severity: Low
- Status: Remediated in this PR; deployment verification pending
- Location: `public/.well-known/security.txt`, lines 1–4
- Evidence: the well-known file was absent. The build now publishes a standards-oriented contact record using the community's existing contact form, with English/Japanese language preferences, a canonical production URL, and an explicit expiry date.
- Impact: without a discoverable disclosure channel, researchers may not know how to report a vulnerability privately.
- Fix: publish `/.well-known/security.txt` from the repository rather than enabling separate edge-managed content that could drift from source control.
- Verification: after deployment, `curl https://kyototechmeetup.com/.well-known/security.txt` must return the committed text with HTTP 200 over HTTPS.

### CF-005 — AI bot access policy not configured

- Rule ID: `CLOUDFLARE-AI-BOTS`
- Cloudflare severity: Moderate
- Status: Optional product/content-policy decision; not an application vulnerability
- Location: Cloudflare Security Settings → Configure AI bot policies
- Evidence: Cloudflare reports the setting as inactive. Cloudflare now distinguishes Search, Agent, and Training behavior; the legacy all-in-one Block AI bots control is scheduled for deprecation on 2026-09-15.
- Recommendation: allow Search because newcomer discovery is the site's primary goal. Decide separately whether to allow Agent access. Block Training on all pages if the community does not want its published content used for model training. Record the chosen policy so later dashboard changes are intentional.
- False positive notes: this insight does not demonstrate unauthorized access or compromise. It is a content-distribution preference and should not be treated as required security remediation.
- Source: [Cloudflare — Block AI Bots](https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/)

### CF-006 — AI Labyrinth not enabled

- Rule ID: `CLOUDFLARE-AI-LABYRINTH`
- Cloudflare severity: Low
- Status: Optional; low priority
- Location: Cloudflare Security Settings → AI Labyrinth
- Evidence: Cloudflare reports the feature as inactive. AI Labyrinth adds invisible `nofollow` honeypot links intended to trap crawlers that disregard no-crawl guidance.
- Recommendation: leave this as an optional follow-up after the explicit AI bot policy is chosen. It may be enabled as defense in depth, but it does not replace DNS cleanup, SPF, DMARC, or application controls.
- False positive notes: an inactive optional feature is not evidence of an exploitable defect.
- Source: [Cloudflare — AI Labyrinth](https://developers.cloudflare.com/bots/additional-configurations/ai-labyrinth/)

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
4. Confirm `/.well-known/security.txt` returns HTTP 200 and matches the committed canonical/contact record.
5. Remove or repair the wildcard DNS record, then confirm a random subdomain no longer resolves.
6. Publish the Hover SPF and initial DMARC TXT records, wait for DNS propagation, and verify them with independent TXT lookups.
7. Record the community's choices for Cloudflare Search, Agent, Training, and AI Labyrinth settings; these are policy decisions rather than release blockers.
