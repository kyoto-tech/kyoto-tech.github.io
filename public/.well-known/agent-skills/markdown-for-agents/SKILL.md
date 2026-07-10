---
name: markdown-for-agents
description: Maintain Kyoto Tech Meetup's localized Markdown responses for AI agents.
---

# Maintain Markdown for Agents

Keep the agent-facing Markdown contract aligned with the normal Astro homepage.

## Source of truth

- `scripts/agent-markdown.mjs` generates the English and Japanese Markdown documents.
- `src/data/meetup-events.json` supplies the event snapshot.
- `src/data/composite-feed.json` supplies the “What members are publishing” items.
- `functions/index.js` and `functions/ja/index.js` negotiate `Accept: text/markdown`.
- `public/_routes.json` keeps the Pages Functions scope limited to `/` and `/ja/`.

## When changing the contract

1. Update both English and Japanese output in `scripts/agent-markdown.mjs`.
2. Keep event, feed, RSVP, map, and community links validated as HTTP(S) URLs.
3. Keep the Markdown concise and factual; do not add API, OAuth, MCP, publishing, or account capabilities that the site does not provide.
4. Update `test/agent-markdown.test.mjs` for content, locale, or negotiation changes.
5. Run `npm run check` and `npm run build`.
6. Verify `/` and `/ja/` with `Accept: text/markdown`, and verify a request without that header still returns HTML.

## Response contract

Markdown responses must return HTTP 200 with `Content-Type: text/markdown; charset=utf-8` and `Vary: Accept`. Normal browser requests must continue to receive the Astro HTML page and the existing security headers.

The generated discovery index contains a digest for this file. Run the build after editing it so the index is regenerated.
