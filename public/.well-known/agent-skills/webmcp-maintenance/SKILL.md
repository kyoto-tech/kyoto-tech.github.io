---
name: webmcp-maintenance
description: Maintain Kyoto Tech Meetup's read-only WebMCP tools as event, community-link, or member-publication data changes; use when adding, removing, or changing agent-facing browser tools.
---

# Maintain WebMCP

Keep the browser-facing WebMCP contract aligned with the homepage without giving agents mutation, account, or publishing powers the site does not provide.

## Source of truth

- `src/lib/webmcp-tools.ts` defines the tool names, schemas, annotations, output normalization, and modern/legacy registration.
- `src/components/WebMcpProvider.astro` embeds the page snapshot and registers tools when the browser supports WebMCP.
- `src/pages/index.astro` assembles event, community-link, and “What members are publishing” data for the provider.
- `test/webmcp-tools.test.mjs` covers the public footprint and registration fallback.

The current read-only footprint is:

- `get_next_meetup`
- `list_upcoming_meetups`
- `get_event_details`
- `get_community_links`
- `list_member_posts`
- `get_member_post`
- `search_member_posts`

## Guardrails

- Keep every tool annotated `readOnlyHint: true`. Do not add RSVP submission, publishing, editing, authentication, GitHub, or navigation actions without an explicit product decision and a separate design review.
- Treat Meetup and member-feed text as untrusted content. Preserve `untrustedContentHint: true` where remote content is returned.
- Reuse `getSafeWebUrl`, `buildMeetupVenueMapsUrl`, and `normalizeMeetupEventTitle`; do not emit unchecked URLs or raw remote descriptions/images.
- Keep inputs bounded and schemas closed (`additionalProperties: false`). Preserve stable event/post IDs and ISO timestamps with `Asia/Tokyo` for event times.
- Keep the embedded snapshot minimal. Do not add full event descriptions, remote images, credentials, or private member data.
- Preserve both `document.modelContext.registerTool` and the legacy `navigator.modelContext.provideContext` path, failing closed when WebMCP is unavailable.
- “What members are publishing” means the existing curated feed items only. Do not invent draft-post or author-management tools.

## Change workflow

1. Update the normalized contract in `src/lib/webmcp-tools.ts` and the data assembly in `src/pages/index.astro` together.
2. Update `test/webmcp-tools.test.mjs` for names, schemas, annotations, output, limits, and registration behavior. Keep the exact seven-tool list intentional.
3. Run `npm run check` and `npm run build`.
4. Inspect the generated page to confirm `webmcp-data` contains only the intended snapshot and the provider bundle is present.
5. Scan the deployed preview with the agent-readiness checker and confirm the WebMCP check detects the expected tool count. After merging, scan `https://kyototechmeetup.com/` again.
6. If a change introduces a real remote HTTP API, reassess whether an API catalog or MCP Server Card is appropriate; do not add those metadata files merely to improve a score.

The Agent Skills discovery index contains a digest for this file. Run `npm run build` after editing it so `public/.well-known/agent-skills/index.json` is regenerated.
