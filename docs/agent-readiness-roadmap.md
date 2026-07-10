# Agent Readiness Roadmap

Status: Core work complete — PRs 107–112 merged; DNSSEC and authoring workflows deferred

## Purpose

Make the site easier for useful agents to understand and navigate without inventing capabilities the community does not provide. The first milestone is helping an agent answer a newcomer’s practical questions: what is the next meetup, how do I join, where is it, and what else can I explore?

This roadmap covers three related workstreams:

1. Markdown negotiation for efficient agent consumption.
2. WebMCP tools for structured, read-only discovery of events and published community content.
3. DNSSEC for authenticated DNS responses.

DNS-AID remains deferred until the site has a real agent endpoint or capability descriptor to advertise. DNSSEC is useful independently, but signing an empty or misleading agent inventory would not improve the site’s integrity.

## Current state

- `robots.txt`, the sitemap, and `/.well-known/security.txt` are live.
- Link headers advertising the sitemap and security contact are implemented in PR 107.
- The site is a static Astro build deployed to Cloudflare Pages.
- Meetup events and member feeds are fetched at build time and rendered from committed JSON snapshots.
- There is no public API, OAuth provider, MCP server, or authenticated service. The Agent Skills index and WebMCP read-only tools are live.
- Cloudflare’s managed Markdown for Agents feature may not be available on the zone’s current Free plan.

## Delivery order

| PR | Workstream | Depends on | Outcome |
| --- | --- | --- | --- |
| A | Markdown response negotiation | Existing static build | `/` and `/ja/` return useful Markdown when requested with `Accept: text/markdown` while browsers continue receiving HTML |
| B | WebMCP read-only discovery | A stable event/feed data contract | Agents can find events, RSVP destinations, community links, and published member content through structured tools |
| C | DNSSEC activation | Registrar access at Hover | Cloudflare DNS answers are cryptographically authenticated |
| D | DNS-AID evaluation | A real agent endpoint or capability descriptor | Decide whether an SVCB/HTTPS record would describe a genuine service |

PRs A and B are complete. DNSSEC remains an independent infrastructure project, and WebMCP author/content actions remain deferred until explicit organizer approval and a separate permission review.

---

## PR A — Markdown negotiation for agents

### Objective

Serve a concise, machine-friendly representation of the homepage when a client explicitly requests Markdown, while keeping normal browser requests unchanged.

### Proposed architecture

```text
Request / or /ja/
        |
        v
Cloudflare Pages Function (route only localized homepages)
        |
        +-- Accept: text/markdown --> committed Markdown document
        |
        +-- browser/default ------> env.ASSETS.fetch(request)
```

### Implementation details

- Add a route-specific Pages Function for `/` and `/ja/`; do not put a catch-all function in front of every asset.
- Keep the Markdown source in a reviewed repository file, for example `src/content/agent-home.en.md` and `src/content/agent-home.ja.md`, or generate it from the same event data used by Astro.
- Return `Content-Type: text/markdown; charset=utf-8` and `Vary: Accept` for Markdown responses.
- Preserve the existing security headers on both HTML and Markdown responses.
- Keep the Markdown focused on useful facts: next event, upcoming events, RSVP links, venue/map links, newcomer expectations, language support, community links, and member-feed links.
- Include source timestamps for event/feed data so agents can distinguish current information from cached content.
- Add `_routes.json` rules so static assets continue to bypass Functions and retain Cloudflare’s unlimited static-request behavior.
- Prefer a small explicit Markdown document over an HTML-to-Markdown converter. This avoids leaking navigation markup and makes the agent-facing contract reviewable.

### Acceptance criteria

- `curl -H 'Accept: text/markdown' https://kyototechmeetup.com/` returns HTTP 200 with `Content-Type: text/markdown`.
- The same request to `/ja/` returns Japanese Markdown.
- `curl https://kyototechmeetup.com/` continues to return the normal HTML page.
- Both responses include the expected security headers and the Markdown response includes `Vary: Accept`.
- Event links and map links pass the existing safe-URL rules.
- A stale or unavailable event refresh does not make the Markdown endpoint fail when a valid committed snapshot exists.
- The scanner’s Markdown-for-Agents check passes without changing the browser experience.

### Verification

- Add unit tests for Accept-header parsing, language selection, and fallback behavior.
- Add an integration check against `wrangler pages dev` or the deployed preview.
- Test `Accept: text/html`, `Accept: text/markdown`, and a weighted header such as `text/html;q=0.8, text/markdown;q=1`.
- Test the no-upcoming-event state.
- Run `npm run check` and a production build.

---

## PR B — WebMCP discovery tools

### Objective

Expose a deliberately small set of read-only tools that help an agent guide a person to the next Kyoto Tech Meetup and browse the existing “What members are publishing” section without creating a second source of truth or performing external actions.

WebMCP is still an evolving Community Group specification, not a final web standard. The implementation should feature-detect the API and do nothing on browsers that do not support it.

### Initial tool set

| Tool | Inputs | Output | Side effects |
| --- | --- | --- | --- |
| `get_next_meetup` | None | The next upcoming event, or a clear no-event result | None |
| `list_upcoming_meetups` | Optional `limit`, `language` | A bounded list of normalized events | None |
| `get_event_details` | `eventId` | One event with date, venue, RSVP, map, and source metadata | None |
| `get_community_links` | Optional `language` | Meetup, Discord, GitHub, LinkedIn, contact, and calendar links | None |
| `list_member_posts` | Optional `limit`, `source` | Recent “What members are publishing” items with attribution and timestamps | None |
| `get_member_post` | `postId` | One published member item with title, excerpt, source, timestamp, and link | None |
| `search_member_posts` | `query` plus optional `source` | Matching cached member-feed items | None |

### Data and safety contract

- Read from the existing normalized `meetup-events.json` and `composite-feed.json` data, not from arbitrary URLs supplied by the agent.
- Return stable IDs, ISO timestamps, `Asia/Tokyo` timezone context, source names, and validated HTTPS links.
- Bound `limit` values and query lengths to prevent expensive or surprising work.
- Mark tools as read-only.
- Mark event and feed output as untrusted content because it originates from remote Meetup/RSS sources.
- Never allow a tool to submit an RSVP, send a message, edit GitHub, or publish content.
- Return links for the agent or user to review and follow; do not automatically navigate or open a new site.
- Use localized titles/descriptions where available, with English fallback behavior matching the site’s existing i18n rules.

The member-content footprint is intentionally limited to the content already selected, normalized, and rendered in the homepage’s “What members are publishing” section. WebMCP does not become a new feed reader, authoring surface, submission workflow, or publishing channel.

### API compatibility

Implement a small adapter because the API is changing:

- Prefer the current `document.modelContext.registerTool()` API when available.
- Support the earlier `navigator.modelContext.provideContext()` shape only as a compatibility path if the target browser exposes it.
- Gate all registration behind feature detection and secure-context checks.
- Keep registration in a small client script loaded on the homepage; it must not affect rendering or navigation when unavailable.

### Acceptance criteria

- A supporting browser reports the seven read-only tools with accurate names, descriptions, and JSON Schemas.
- A normal browser sees no console errors and no visible UI change.
- An agent can find the next event and receive a valid RSVP URL without being given permission to submit anything.
- Member-feed results preserve attribution and do not execute or interpret feed content as instructions.
- Invalid event IDs, oversized limits, unsafe URLs, and malformed cached data produce bounded error results.
- The scanner’s WebMCP check detects tools after the feature is enabled in a supporting browser.

### Verification

- Unit-test tool schemas and each tool’s output against fixture event/feed data.
- Test registration when `document.modelContext` is absent, partially implemented, and fully implemented.
- Test URL validation and untrusted-content annotations.
- Use a browser implementation that supports the current WebMCP preview for a manual read-only walkthrough.
- Add a security review specifically for prompt injection through event titles, descriptions, and feed excerpts.

---

## PR C — DNSSEC

### Objective

Enable authenticated DNS responses for `kyototechmeetup.com`.

### Operational steps

1. Confirm the current authoritative nameservers are Cloudflare and check whether Hover already has a DS record.
2. In Cloudflare **DNS → Settings → DNSSEC**, enable DNSSEC and copy the generated DS values.
3. At Hover, add the DS record at the registrar level. This is not a normal DNS record in Cloudflare.
4. Wait for the Cloudflare DNSSEC status to become active.
5. Verify the chain from independent validating resolvers.

### Safety requirements

- Do not enable Cloudflare signing while an old, mismatched DS record remains at Hover.
- Do not manually add `DNSKEY`, `RRSIG`, or `NSEC` records to the Cloudflare zone.
- If Hover cannot publish the DS record, stop after gathering the Cloudflare values and do not leave the domain in a partially delegated state.
- Plan rollback as: remove the DS at Hover first, wait for parent-zone propagation, then disable DNSSEC in Cloudflare.

### Verification

```bash
dig DS kyototechmeetup.com
dig +dnssec kyototechmeetup.com SOA
dig +dnssec kyototechmeetup.com A
```

Use a validating resolver and confirm the response carries authenticated data. Cloudflare’s documentation distinguishes the `pending` state (zone signed, DS not yet at the registrar) from `active` (the chain is complete): [Cloudflare DNSSEC](https://developers.cloudflare.com/dns/dnssec/).

DNSSEC protects the authenticity and integrity of DNS answers. It does not provide HTTPS, agent authentication, API discovery, or DNS-AID by itself.

---

## Decision gates and success measures

### Before PR A

- Confirm Cloudflare Pages Functions are acceptable for the Free-plan request quota.
- Agree on the concise English and Japanese Markdown content contract.

### Before PR B

- Confirm the event/feed JSON shapes are stable enough to expose as public tool output.
- Choose the first browser/runtime for WebMCP verification.
- Complete a prompt-injection review of remote event/feed content.

### After PRs A–C

- Markdown check passes for `/` and `/ja/`.
- WebMCP tools are discoverable in a supporting browser and fail closed elsewhere, with the member-content tools limited to the published homepage feed.
- DNSSEC is active and independently validated.
- Newcomers can ask an agent for the next meetup and receive a current, attributable RSVP path without the agent being granted publishing or account authority.

## Deferred capabilities

Do not publish API catalogs, OAuth metadata, MCP server cards, agent-skill indexes, or DNS-AID records until the corresponding service exists. A discovery document that advertises a nonexistent endpoint is worse than a failed scanner check because it teaches agents an incorrect capability contract.
