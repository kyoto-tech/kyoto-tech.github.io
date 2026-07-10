# Kyoto Tech Meetup Website

This repository holds the Astro-powered marketing site for the Kyoto Tech Meetup community.

Everything here is maintained by community members; contributions that make the experience clearer, more accessible, or easier to maintain are welcome.

## Tech Stack

- [Astro 7](https://astro.build/) with React islands for dynamic UI.
- [Tailwind CSS 4 (via `@tailwindcss/vite`)](https://tailwindcss.com/) for utility-first styling plus a small layer of global CSS.
- [React Icons](https://react-icons.github.io/react-icons/) for server-rendered interface icons.
- ESLint (flat config), TypeScript, Knip, and Astro Check keep the project tidy.

## Getting Started

1. Use Node.js 22.12.0 or newer, then install dependencies:

   ```bash
   npm install
   ```

2. Start the local dev server:

   ```bash
   npm run dev
   ```

   Visit `http://localhost:4321` to view the site. Astro enables hot module replacement, so edits appear immediately.

3. Build for production:

   ```bash
   npm run build
   npm run preview
   ```

## Useful Scripts

| Command            | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run dev`      | Launches Astro in development mode.                                     |
| `npm run check`    | Runs lint, type-check, Astro check, and Knip in sequence.               |
| `npm run events:pull` | Refreshes the committed Meetup event cache and fails on errors.      |
| `npm run events:pull:stale-ok` | Refreshes Meetup events or preserves the last valid cache. |
| `npm run agent:markdown` | Generates the English and Japanese Markdown responses used for agent content negotiation. |
| `npm run agent:skills` | Generates the agent-skills discovery index and its SHA-256 digests. |
| `npm run feeds:notify` | Polls approved member feeds and posts unseen items to configured channels. |
| `npm run feeds:notify:dry-run` | Shows what the notifier would send without posting or updating state. |
| `npm run preview`  | Serves the production build locally.                                    |
| `npm run build`    | Produces the static site in `dist/`.                                    |

## Project Structure

```txt
src/
├─ pages/        # Astro pages (currently the main landing page)
├─ layouts/      # Shared shells and metadata
├─ components/   # Reusable sections (WhyJoin, WhatWeDo, etc.)
├─ styles/       # Global CSS entry point and Tailwind import
└─ assets/       # Static assets bundled by Astro
public/          # Files served as-is (favicon, images)
```

## Contributing

1. Fork or clone the repo, then branch from `main`.
2. Make your changes and commit on your branch.
3. Before submitting a pull request:
    1. Ensure your local branch is up to date with `main`.
    2. Run `npm run check` to ensure lint, type, and Astro diagnostics all pass.
4. Push your branch to the remote repository.
5. Open a pull request, describing what you changed.
6. Request a review.

## Ideas for Contributions

- Expand homepage content (additional recurring events, partner highlights, FAQs).
- Build an email newsletter signup form.
- Improve accessibility (ARIA labeling, color contrast, keyboard navigation checks).
- Add tests or visual regression tooling for future redesigns.
- Internationalization or localization improvements for Japanese/English visitors.

## Product Roadmaps

- [Homepage redesign roadmap](docs/homepage-redesign-roadmap.md) — an event-led newcomer journey and Community Hub, organized as independently shippable pull requests.
- [Agent readiness roadmap](docs/agent-readiness-roadmap.md) — Markdown negotiation, WebMCP discovery/content workflows, and DNSSEC, with DNS-AID deferred until a real agent endpoint exists.

## Deployment

- Production deploys target [Cloudflare Pages](https://kyototechmeetup.com/) via Cloudflare's GitHub integration on merge to `main`.
- Pull requests use GitHub Actions for CI checks and Cloudflare Pages for preview deployments.
- GitHub can also trigger Cloudflare rebuilds via the deploy hook (`CLOUDFLARE_DEPLOY_HOOK`) every 3 hours by cron or by manual dispatch (`.github/workflows/scheduled-build.yml`).
- Community feed notifications are handled separately by `.github/workflows/community-feed-notifier.yml`, which polls approved feeds every 15 minutes and tracks seen items in a gist-backed JSON state file.
- The legacy [GitHub Pages URL](https://kyoto-tech.github.io/) is maintained as a redirect only, published from `.github/redirect-site` by `.github/workflows/deploy-github-pages-redirect.yml`.
- To test a production build locally, use `npm run build && npm run preview`.

## Meetup Event Cache

- `src/data/meetup-events.json` is the generated event snapshot consumed by the Astro pages.
- `npm run events:pull` refreshes the snapshot from Meetup and fails if the request or response is invalid.
- `npm run events:pull:stale-ok` keeps the last valid snapshot when Meetup is temporarily unavailable. Production builds use this mode.
- Page rendering reads only the committed snapshot; it does not make live Meetup requests while generating `/` and `/ja/`.
- Event reminders continue to fetch live Meetup data because they run as a separate operational workflow.

## Markdown for agents

- `npm run agent:markdown` generates ignored build files at `public/agent-home.en.md` and `public/agent-home.ja.md` from the committed event and member-feed snapshots.
- Production builds run this generator after the stale-safe event/feed refreshes.
- Cloudflare Pages Functions at `/` and `/ja/` return those files only when the request explicitly accepts `text/markdown`; normal browser requests continue to receive the Astro HTML pages.
- Verify locally or against a preview with `curl -H 'Accept: text/markdown' -D - https://preview-url/`.
- The Markdown maintenance skill is published at `/.well-known/agent-skills/markdown-for-agents/SKILL.md`; `npm run agent:skills` regenerates its discovery index digest during builds.

## Community Feed Notifier

- The notifier reads approved sources from `src/data/member-feeds.json`.
- Each feed source has a stable `id`; do not change it casually because notifier state keys are derived from it.
- State lives in the public gist `f95dd7597eec170d738d905e3666bfc6` as `community-feed-state.json`.
- On the first non-dry run, the notifier seeds the current backlog into the gist without posting. Use the workflow dispatch input `allow_initial_posts` if you intentionally want to announce the backlog.
- For a lightweight demo, use the workflow dispatch input `demo_mode`. It posts at most 3 items and seeds the rest of the current backlog so later scheduled runs do not replay the full backlog.
- Required secret: `GH_GIST_TOKEN` with the `gist` scope.
- Optional secret: `DISCORD_WEBHOOK_URL` for direct Discord posting.
- Optional secret: `COMMUNITY_FEED_GENERIC_WEBHOOK_URL` for forwarding each new item as JSON to your own bot/service for X, LINE, or other destinations.
- Scheduled runs skip notification work when no destination webhook secret is configured.

## Interacting with the community

- **Want to report a bug or suggest a feature?**
  - [Open an issue on GitHub](https://github.com/kyoto-tech/site/issues).
- **Need help getting started?**
  - [Join the Kyoto Tech Meetup Discord](https://discord.gg/mXFWEHDKeu).

---

Thanks for helping keep Kyoto’s tech community visible!
