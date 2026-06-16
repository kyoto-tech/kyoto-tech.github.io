# Technical Design Document

## Overview

The Kyoto Tech Meetup system is an Astro 5 static site deployed on Cloudflare Pages, supported by several Node.js automation scripts run via GitHub Actions. There are two distinct runtime environments: **build-time** (Astro SSG, runs in GitHub Actions or Cloudflare Pages workers) and **runtime automation** (standalone Node ESM scripts invoked by scheduled workflows).

The system has four main subsystems:
1. **Public website** — static HTML/CSS/JS served from Cloudflare Pages at `https://kyototechmeetup.com`
2. **Data pipelines** — build-time event fetching and feed aggregation that produce the site's dynamic content
3. **Notification system** — scheduled scripts that deliver new community content and event reminders to Discord
4. **CI/CD automation** — GitHub Actions workflows for PR checks, scheduled rebuilds, and deployments

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions                                                       │
│                                                                       │
│  build.yml ──────── PR check ──────────────────────────────────────► │
│  scheduled-build.yml ─── POST deploy hook ──────────────────────►   │
│  community-feed-notifier.yml ─── node scripts/... ──────────────►   │
│  meetup-event-reminder.yml   ─── node scripts/... ──────────────►   │
└──────────────────────────┬───────────────────────────┬──────────────┘
                           │                           │
                           ▼                           ▼
              ┌────────────────────┐       ┌──────────────────────┐
              │ Cloudflare Pages   │       │  External Services    │
              │  astro build       │       │  ──────────────────  │
              │  ├─ fetch events   │       │  Meetup.com (scraper)│
              │  └─ composite-feed │       │  GitHub Gist (state) │
              │                    │       │  Discord webhook      │
              │ kyototechmeetup.com│       │  Meetup RSS/YouTube  │
              └────────────────────┘       └──────────────────────┘
```

---

## Repository Layout

```
kyoto-tech.github.io/
├── src/
│   ├── components/       # Astro + React UI components
│   ├── data/             # Generated and static data files
│   ├── i18n/             # String tables and translation helper
│   ├── layouts/          # HTML shell (Layout.astro)
│   ├── lib/              # Shared TypeScript library functions
│   ├── pages/            # Astro page routes (index.astro, ja/index.astro)
│   └── styles/           # Tailwind v4 global CSS
├── scripts/
│   ├── lib/              # Shared JS library (reader, state)
│   ├── community-feed-notifier.mjs
│   ├── meetup-event-reminder.mjs  # NEW
│   ├── fetch-feeds.mjs
│   └── optimize-images.mjs
├── test/                 # Vitest test suite (.test.mjs)
├── public/               # Static assets (images, favicons)
├── assets/raw-images/    # Image backup + optimization sentinels
├── .github/
│   ├── workflows/        # GitHub Actions workflows
│   └── redirect-site/    # Legacy GitHub Pages redirect
└── astro.config.mjs
```

---

## Subsystem 1: Public Website

### Page Structure

The site is a single-page-per-locale architecture. Both locales share identical markup through Astro's component props system — `src/pages/ja/index.astro` is 3 lines that render `<RootIndex lang="ja" />`.

**Section rendering order** in `src/pages/index.astro`:
```
Layout.astro (HTML shell)
  Header.astro (fixed nav, LanguagePicker)
  Hero.astro
  <main id="main-content">
    #quick-links  (inline — 4 icon link cards)
    #calendar
      ├── Legend cards (3 event type thumbnails)
      ├── Calendar.astro → FullCalendarView.jsx [client:load]
      ├── FeedTimestamps.jsx [client:load]
      └── #locations (Google Maps iframes)
    #community-feed
      └── FeedTimestamps.jsx [client:load]
    #why-join → WhyJoin.astro
    #who-comes (inline)
  Footer.astro
```

**React islands** (hydrated via `client:load`, the rest is zero-JS Astro):
- `FullCalendarView.jsx` — renders `@fullcalendar/react` day-grid in JST
- `FeedTimestamps.jsx` — client-side timezone-aware timestamp display (used ×2)

### Routing and i18n

Astro i18n is configured with `defaultLocale: "en"` and `locales: ["en", "ja"]`. The English site serves from `/`, Japanese from `/ja/`.

Language detection runs as an inline script before first paint in `Layout.astro`:
1. Read `localStorage["kyoto-tech-language"]`
2. If absent, check `navigator.language` / `navigator.languages` for `"ja"` prefix
3. If detected language doesn't match current URL locale, call `location.replace()` to the correct locale root
4. Path comparison normalises by stripping `index.html` and ensuring a trailing slash

`LanguagePicker.astro` writes `"en"` or `"ja"` to `localStorage["kyoto-tech-language"]` on click. `localStorage` failures are silently caught.

All user-visible strings are resolved through `useTranslations(lang)` in `src/i18n/utils.ts`, which falls back to the `en` table when a key is absent in `ja`.

### Layout Shell (`src/layouts/Layout.astro`)

Provides for every page:
- `<html lang={activeLang}>` — `"en"` or `"ja"`
- `<link rel="canonical">`, `<link rel="alternate" hreflang="...">` (en, ja, x-default)
- Open Graph (`og:locale`, `og:locale:alternate`, title, description, image)
- Twitter card meta (mirrors OG values)
- `<script type="application/ld+json">` — Schema.org `@graph` with Organization, Person, WebSite, EventSeries ×2, WebPage nodes
- GTM script `GTM-5SB4S7NJ` in `<head>` + noscript `<iframe>` at top of `<body>`
- Skip-link to `#main-content`
- `<ClientRouter />` for Astro View Transitions between locales

### Event Calendar

`Calendar.astro` fetches `MeetupEvent[]` at build time via `fetchMeetupEvents()`, converts them to FullCalendar `EventInput[]` via `toFullCalendarEvents()`, computes the five-week display window with `getFiveWeekCalendarRange()`, and passes all three to `FullCalendarView.jsx`.

`FullCalendarView.jsx` uses the `dayGridFiveWeek` custom view type (35-day fixed range starting Monday), `timeZone: "Asia/Tokyo"`, and applies `className: ["event-type-{type}"]` per event for CSS-based type differentiation.

`getFiveWeekCalendarRange(currentDate, firstDay=1)` computes a UTC Monday-anchored start using `Date.UTC` arithmetic and returns `{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }`.

`classifyEventType(title)` applies rules in priority order: `coffee` (contains "coffee", case-insensitive) → `hack-day` (`\bhack[-\s]+day\b`) → `special`.

---

## Subsystem 2: Data Pipelines

### Build-Time Data Flow

```
npm run build
  └─ npm run feeds:pull:stale-ok
  │    └─ scripts/fetch-feeds.mjs
  │         ├─ reads src/data/member-feeds.json
  │         ├─ fetches RSS/Atom per source (timeout 12s)
  │         │   └─ YouTube @handle URLs: scrape channel page for channel ID first
  │         ├─ normalizes items (id, title, link, publishedAt, summary, image)
  │         │   └─ image resolution priority:
  │         │       enclosure → media thumbnail → inline <img> → OG meta (page fetch) → YouTube thumbnail
  │         ├─ limits to 3 items/feed (configurable), sorted desc by date
  │         └─ writes src/data/composite-feed.json
  │              { generatedAt, itemsPerFeed, feeds[], failedSources[] }
  │              (--stale-ok: falls back to existing file if all feeds fail)
  └─ astro build
       └─ src/pages/index.astro
            ├─ import composite-feed.json  (community feed section)
            ├─ Calendar.astro.fetchMeetupEvents()  (scrapes Meetup __NEXT_DATA__)
            └─ import event-locations.json
```

### Meetup Scraper (`src/lib/meetup-events.ts`)

The scraper is called at build time from `Calendar.astro` and at automation time from `scripts/meetup-event-reminder.mjs`. It:
1. GETs `https://www.meetup.com/kyoto-tech-meetup/events/?_cb={timestamp}` with `cache-control: no-cache`
2. Extracts `<script id="__NEXT_DATA__">` JSON, traverses `props.pageProps.__APOLLO_STATE__`
3. Resolves Apollo refs for `PhotoInfo:*`, `Venue:*`, `SocialProofInsights:*`, and `going` totals
4. Filters to events starting within 60 days, or in-progress (end time in future, or within 4h grace window)
5. Returns `MeetupEvent[]` sorted by ascending start, or `[]` on any error

**`MeetupEvent` type:**
```ts
{
  title: string;        // normalized (stripped suffix + weekday for coffee)
  link: string;         // Meetup event URL
  start: string;        // ISO 8601
  endTime: string | null;
  description: string;
  image: string | null;
  goingCount: number;
  interestedCount: number;
  eventType: EventType; // "coffee" | "hack-day" | "special"
  venue: { name?, address?, city?, state?, country? } | null;
}
```

### Feed Aggregator (`scripts/fetch-feeds.mjs`)

Writes `src/data/composite-feed.json`. Shares `resolveFeedUrl`, `fetchRawFeedItems`, and `normalizeAndLimitFeedItems` from `scripts/lib/community-feed-reader.mjs` but uses its own `normalizeItem` function with richer image resolution (including linked-page OG scraping). Source entries in `src/data/member-feeds.json` use `{ id, name, siteUrl, feedUrl }`.

### Image Optimiser (`scripts/optimize-images.mjs`)

Processes `public/images/**` with `sharp`. State tracked via sentinel JSON files in `assets/raw-images/.optimized/`. Key behaviours: skips already-optimised images, backs up originals, converts non-JPEG/PNG formats to JPEG, `--check` mode exits non-zero if any images need optimisation (used in CI).

---

## Components and Interfaces

### Shared Infrastructure

Both notification scripts share:
- **`scripts/lib/community-feed-reader.mjs`** — `fetchWithTimeout`, `fetchJson`, `fetchText`, `loadMemberFeeds`
- **`scripts/lib/community-feed-notifier-state.mjs`** — Gist state read/write, state schema, migration, Discord payload builders
- **GitHub Gist** `f95dd7597eec170d738d905e3666bfc6` — single shared state file `community-feed-state.json`

## Data Models

### Notifier State Schema

The state schema is versioned. Version 2 (current) tracks feed item delivery. Version 3 (new) adds event reminders.

**Version 3 state shape:**
```json
{
  "version": 3,
  "initializedAt": "ISO | null",
  "updatedAt": "ISO | null",
  "items": {
    "{sourceId}::{itemId}": {
      "id": "string",
      "sourceItemId": "string",
      "title": "string",
      "link": "string",
      "publishedAt": "ISO",
      "summary": "string | null",
      "source": { "id": "string", "name": "string", "feedUrl": "string", "siteUrl": "string" },
      "firstSeenAt": "ISO",
      "lastSeenAt": "ISO",
      "suppressed": "boolean",
      "channels": {
        "discord": {
          "deliveredAt": "ISO | null",
          "deliveryId": "string | null",
          "lastAttemptAt": "ISO | null",
          "lastError": "string | null"
        }
      }
    }
  },
  "events": {
    "{meetup-event-link-url}": {
      "eventId": "string (link URL)",
      "title": "string",
      "start": "ISO",
      "reminders": {
        "24h": {
          "deliveredAt": "ISO | null",
          "deliveryId": "string | null",
          "lastAttemptAt": "ISO | null",
          "lastError": "string | null"
        },
        "1h": { "... same fields ..." }
      }
    }
  },
  "weeklyDigest": {
    "2026-W25": {
      "deliveredAt": "ISO | null",
      "deliveryId": "string | null",
      "lastAttemptAt": "ISO | null",
      "lastError": "string | null"
    }
  }
}
```

**Key design decisions:**
- `events` map lives at top level, keyed by the Meetup event link URL (stable identifier)
- `weeklyDigest` map lives at top level (not per event), keyed by ISO week (`YYYY-Www`); one entry per week covers all events in that week
- `items` map is unchanged from v2; v2→v3 migration is additive — initialises `events: {}` and `weeklyDigest: {}` if absent
- Delivery records use the same 4-field shape (`deliveredAt`, `deliveryId`, `lastAttemptAt`, `lastError`) throughout

### State Migration

`migrateStateItemIds()` in `scripts/lib/community-feed-notifier-state.mjs` handles version upgrades:
- **v1 → v2**: re-keys `items` from `feedUrl::itemId` to `sourceId::itemId`
- **v2 → v3** (new): initialises `state.events = {}` and `state.weeklyDigest = {}` if absent; bumps `state.version` to 3; `state.items` is untouched
- `CURRENT_STATE_VERSION` constant is bumped to `3`
- `parseState()` updated to parse `events` and `weeklyDigest` top-level fields (defaulting to `{}`)
- `defaultState()` updated to return `{ version: 3, items: {}, events: {}, weeklyDigest: {} }`

### Community Feed Notifier (`scripts/community-feed-notifier.mjs`)

Runs every 15 minutes via `community-feed-notifier.yml`. Core loop:

```
parseArgs → getDestinations (discord, genericWebhook) → readStateFromGist
→ migrateStateItemIds  (v1→v2, now also v2→v3)
→ for each feed: fetchFeedItems
→ if first run (items empty) and !allowInitialPosts: seed all as suppressed → writeStateToGist → exit
→ for each item (sorted asc by publishedAt):
    upsertStateRecord → skip if suppressed → skip if all channels delivered
    → deliverItem (per destination: skip if already delivered → POST → record result)
    → writeStateToGist (after each item, for durability)
→ exit non-zero if any delivery failures
```

Discord payload format (built by `buildDiscordPayload`):
```json
{
  "content": "New community post from **{source.name}**",
  "embeds": [{
    "title": "item.title",
    "url": "item.link",
    "timestamp": "item.publishedAt",
    "author": { "name": "source.name", "url": "source.siteUrl" },
    "footer": { "text": "source.siteUrl" },
    "description": "item.summary (omitted if empty)"
  }]
}
```

### Meetup Event Reminder Script (`scripts/meetup-event-reminder.mjs`) — NEW

Runs every 15 minutes via `meetup-event-reminder.yml`. Entry point flow:

```
parseArgs (--dry-run, --skip-without-destinations)
→ check DISCORD_WEBHOOK_URL (exit if absent per flag)
→ check COMMUNITY_FEED_STATE_GIST_ID (exit non-zero if absent and !dryRun)
→ fetchMeetupEvents()  (exit 0 + warn if empty or throws)
→ readStateFromGist → migrateStateItemIds (ensures v3 shape)
→ now = new Date()

── Pre-event reminders ──
for each event:
  upsertEventStateRecord (initialise state.events[event.link] if absent)
  for each window in ["24h", "1h"]:
    triggerTime = event.start - offset
    if now >= triggerTime AND state.events[link].reminders[window].deliveredAt is null:
      send reminder → writeStateToGist

── Weekly digest ──
isMondayJST = check day-of-week in Asia/Tokyo
isPastEightJST = check time >= 08:00 in Asia/Tokyo
isoWeek = computeIsoWeek(now, "Asia/Tokyo")
if isMondayJST AND isPastEightJST AND state.weeklyDigest[isoWeek]?.deliveredAt is null:
  weekEvents = events filtered to Monday–Sunday of current JST week
  if weekEvents.length > 0:
    send digest → writeStateToGist

exit non-zero if any delivery failures
```

**Reminder Discord payload:**
```json
{
  "content": "⏰ Event reminder — **{emoji}** {event.title}",
  "embeds": [{
    "title": "event.title",
    "url": "event.link",
    "timestamp": "event.start (ISO 8601)",
    "description": "📍 {venue.name}\n👥 {N} going · {M} interested",
    "footer": { "text": "Kyoto Tech Meetup" }
  }]
}
```
Description venue line is omitted entirely when `venue` is null. Emoji map: `coffee` → ☕, `hack-day` → 💻, `special` → ⭐.

**Weekly digest Discord payload:**
```json
{
  "content": "📅 This week's Kyoto Tech events:",
  "embeds": [{
    "description": "• [Event Title](url) — Mon 1 Jun 2026 at 09:30 JST · 📍 FabCafe Kyoto\n• ..."
  }]
}
```
Venue suffix (` · 📍 {name}`) is omitted when absent. If no events fall in the week, no message is sent and no state entry is created.

**JST day/time calculations:**
Use `Intl.DateTimeFormat` with `timeZone: "Asia/Tokyo"` to determine:
- The current day of week in JST (Monday = 1)
- The current hour/minute in JST (for the 08:00 cutoff)
- The Monday/Sunday week boundaries in JST (for filtering digest events)

ISO week identifier format: `"{YYYY}-W{WW}"` where week number is zero-padded to 2 digits, computed as the ISO 8601 week of the Monday that starts the JST week containing `now`.

### Gist State Read/Write

Both scripts use the same helpers from `community-feed-notifier-state.mjs`:

```js
// Read
GET https://api.github.com/gists/{gistId}
→ gist.files["community-feed-state.json"].content
→ parseState(content)

// Write
PATCH https://api.github.com/gists/{gistId}
body: { files: { "community-feed-state.json": { content: JSON.stringify(state) } } }
Authorization: Bearer {GH_GIST_TOKEN}
```

State is written after each individual delivery (not batched) to preserve partial progress on interruption.

---

## Subsystem 4: CI/CD Workflows

### Workflow Summary

| File | Trigger | Purpose |
|---|---|---|
| `build.yml` | `pull_request` | Lint, typecheck, Astro diagnostics, build |
| `scheduled-build.yml` | cron `0 */3 * * *` + dispatch | POST Cloudflare deploy hook |
| `community-feed-notifier.yml` | cron `*/15 * * * *` + dispatch | Run community feed notifier script |
| `meetup-event-reminder.yml` | cron `*/15 * * * *` + dispatch | Run event reminder script (NEW) |
| `deploy-github-pages-redirect.yml` | push to main (redirect-site paths) + dispatch | Deploy GitHub Pages redirect |

### `build.yml` Detail

```yaml
on: pull_request
concurrency:
  group: pr-build-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
steps:
  - checkout
  - setup-node@v4 (node 20, npm cache)
  - npm ci
  - npm run lint && npm run tsc && npm run astrocheck && npm run build
```

Note: `npm run build` internally runs `feeds:pull:stale-ok` then `astro build`. The `check` script (lint, test, tsc, astrocheck, images:check, knip) is authoritative for the quality gate.

### `community-feed-notifier.yml` Detail

```yaml
on:
  schedule: ["*/15 * * * *"]
  workflow_dispatch:
    inputs: demo_mode, dry_run (default: true), allow_initial_posts
concurrency:
  group: community-feed-notifier
  cancel-in-progress: false   # never cancel; avoid duplicate deliveries
jobs.notify:
  timeout-minutes: 10
  env:
    COMMUNITY_FEED_STATE_GIST_ID: f95dd7597eec170d738d905e3666bfc6
    COMMUNITY_FEED_MAX_ITEMS_PER_FEED: "10"
  secrets: GH_GIST_TOKEN, DISCORD_WEBHOOK_URL, COMMUNITY_FEED_GENERIC_WEBHOOK_URL
```

CLI flags assembled in shell: `demo_mode` → `--max-deliveries 3 --suppress-remaining-after-limit`; no webhooks → `--skip-without-destinations`.

### `meetup-event-reminder.yml` Detail (NEW)

```yaml
on:
  schedule: ["*/15 * * * *"]
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: true    # safe by default
concurrency:
  group: meetup-event-reminder
  cancel-in-progress: false
jobs.remind:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  env:
    COMMUNITY_FEED_STATE_GIST_ID: f95dd7597eec170d738d905e3666bfc6
  secrets: GH_GIST_TOKEN, DISCORD_WEBHOOK_URL
  steps:
    - checkout
    - setup-node@v4 (node 20, npm cache)
    - npm ci
    - run: |
        args=("--skip-without-destinations")
        if [ "${{ github.event.inputs.dry_run || 'false' }}" = "true" ]; then
          args+=("--dry-run")
        fi
        node scripts/meetup-event-reminder.mjs "${args[@]}"
```

`--skip-without-destinations` is passed unconditionally. `--dry-run` is appended only when the `dry_run` input is `true`.

### `deploy-github-pages-redirect.yml` Detail

Two-job pipeline: `build` (upload-pages-artifact from `.github/redirect-site/`) → `deploy` (deploy-pages, only on `main`). Triggered on push to `main` touching `redirect-site/**` or the workflow file itself. Concurrency group `github-pages-redirect`, cancel-in-progress: true.

---

## Module Dependency Map

```
src/lib/event-types.ts
  └── imported by: src/lib/meetup-events.ts
                   src/lib/full-calendar-events.ts (indirect, via MeetupEvent type)

src/lib/meetup-events.ts
  └── imported by: src/components/Calendar.astro (build-time)
                   scripts/meetup-event-reminder.mjs (automation)

src/lib/full-calendar-events.ts
  └── imported by: src/components/Calendar.astro

src/i18n/ui.ts + utils.ts
  └── imported by: all Astro page components and Layout

scripts/lib/community-feed-reader.mjs
  └── imported by: scripts/community-feed-notifier.mjs
                   scripts/fetch-feeds.mjs
                   scripts/meetup-event-reminder.mjs

scripts/lib/community-feed-notifier-state.mjs
  └── imported by: scripts/community-feed-notifier.mjs
                   scripts/meetup-event-reminder.mjs
```

---

## Testing Strategy

**Framework**: Vitest (`npm run test` = `vitest run`). All test files in `test/` use `.test.mjs` extension.

**Existing coverage** (`test/`):
- `event-types.test.mjs` — `classifyEventType` (all three branches + priority ordering)
- `full-calendar-events.test.mjs` — `getFiveWeekCalendarRange` + `toFullCalendarEvents`
- `meetup-events.test.mjs` — `normalizeMeetupEventTitle` (weekday suffix stripping)
- `community-feed-reader.test.mjs` — load, parse, normalise, resolve, fetch, YouTube handling
- `community-feed-notifier-state.test.mjs` — `defaultState`, `parseState`, `upsertStateRecord`, `migrateStateItemIds` (v1→v2), `buildMessage`, `buildDiscordPayload`

**New tests required** for Req 14 and the v3 schema changes:
- `community-feed-notifier-state.test.mjs` — extend with v2→v3 migration cases (adds `events`, `weeklyDigest` fields)
- `meetup-event-reminder.test.mjs` (new) — due-reminder detection logic (24h, 1h window checks), weekly digest day/time checks, ISO week computation, Discord payload builders

All network-touching functions must be mocked via `vi.fn()` or `vi.mock()` to keep tests deterministic.

---

## Environment Variables and Secrets

| Name | Used by | Source |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | notifier, reminder | GitHub Actions secret |
| `COMMUNITY_FEED_GENERIC_WEBHOOK_URL` | notifier | GitHub Actions secret |
| `GH_GIST_TOKEN` | notifier, reminder | GitHub Actions secret |
| `COMMUNITY_FEED_STATE_GIST_ID` | notifier, reminder | Workflow env (hard-coded to `f95dd7597eec170d738d905e3666bfc6`) |
| `COMMUNITY_FEED_MAX_ITEMS_PER_FEED` | notifier | Workflow env (`10`) |
| `COMMUNITY_FEED_TIMEOUT_MS` | notifier | Optional env (default `12000`) |
| `COMMUNITY_FEED_REQUEST_TIMEOUT_MS` | notifier | Optional env (default `10000`) |
| `COMMUNITY_FEED_STATE_GIST_FILENAME` | notifier, reminder | Optional env (default `community-feed-state.json`) |
| `CLOUDFLARE_DEPLOY_HOOK` | scheduled-build | GitHub Actions secret |
| `COMPOSITE_FEED_TIMEOUT_MS` | fetch-feeds | Optional env (default `12000`) |
| `COMPOSITE_FEED_ITEMS_PER_FEED` | fetch-feeds | Optional env (default `3`) |

---

## Error Handling

- **Meetup scraper errors**: `fetchMeetupEvents()` catches all errors (network, parse, missing data) and returns `[]`. The calendar displays a fallback message; the reminder script logs a warning and exits 0.
- **Feed fetch errors**: individual feed failures are recorded in `failedSources` / state `lastError` and processing continues. Only all-feeds-fail is fatal for the notifier.
- **Discord delivery errors**: recorded in `lastError` per state entry, state is written immediately (preserving partial progress), and the script exits non-zero after processing all items.
- **Gist state errors**: write failures on `PATCH` throw and halt the current script run. Read failures return `defaultState()` (empty state), treated as a first-run scenario.
- **Missing secrets**: scripts exit non-zero (with `--skip-without-destinations` as the graceful fallback for missing webhook URLs). Missing `COMMUNITY_FEED_STATE_GIST_ID` outside dry-run is always fatal.
- **Timeout handling**: all HTTP requests use `AbortController` with configurable timeouts (12s feed fetch, 8s page image fetch, 10s API/webhook requests). Aborted requests throw and are caught by the per-item error handling.

## Correctness Properties

### Property 1: Delivery Deduplication
**Validates: Requirements 8.6, 8.11, 17.8**
State is keyed by composite IDs (`sourceId::itemId` for feeds, `event.link` for reminders, `YYYY-Www` for weekly digests). A non-null `deliveredAt` means "delivered, don't retry."

### Property 2: Reminder Idempotency
**Validates: Requirements 17.6, 17.7**
Reminders use a `>=` trigger check (not exact match), so a late cron run still fires the reminder but a subsequent run won't re-fire it (because `deliveredAt` is already set).

### Property 3: State Durability
**Validates: Requirements 8.11, 17.12**
State is written after each individual delivery, not batched. If the process crashes mid-loop, already-delivered items are recorded and won't be re-sent on the next run.

### Property 4: Migration Safety
**Validates: Requirements 8.16, 17.5**
v2→v3 migration is additive only — it adds `events` and `weeklyDigest` fields without modifying existing `items`. Both scripts call `migrateStateItemIds()` on startup, so whichever runs first after a schema bump performs the migration.

### Property 5: Concurrent Access
**Validates: Requirements 8.3, 17.3**
The community feed notifier and the event reminder share a Gist state file. Because both use `cancel-in-progress: false` and run on overlapping 15-minute schedules, there is a theoretical race condition. In practice, each script run takes <30 seconds, making overlap unlikely. The risk is accepted and documented.

## Known Fragilities

1. **Meetup Scraper** — depends on `__NEXT_DATA__` / Apollo cache format. Silent failure returns `[]`; no alerting on unexpected empty result.
2. **YouTube channel ID** — page-scrape for `externalId`/`channelId`; YouTube page structure changes can break it.
3. **Gist-backed state** — no distributed locking. Concurrent runs (possible if a 15-min cron run exceeds 15 min) can diverge state and cause duplicate deliveries. `cancel-in-progress: false` prevents cancellation but not races.
4. **Event reminder scheduling** — cron granularity is 15 minutes, so reminders fire at most 15 minutes late. Reminder logic uses `>=` comparison (not exact) to handle this.
