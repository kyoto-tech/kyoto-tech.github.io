# Implementation Plan: Kyoto Tech Meetup Site

## Overview

This plan covers the complete Kyoto Tech Meetup system — an Astro 5 static site on Cloudflare Pages with bilingual i18n, build-time Meetup event scraping, RSS feed aggregation, Discord notification scripts (community feed notifier + event reminder), image optimisation, and CI/CD automation via GitHub Actions. The implementation uses TypeScript/Astro for the site, Node ESM scripts for automation, and Vitest for testing.

## Tasks

- [x] 1. Site structure, layout, and navigation
  - [x] 1.1 Create Layout shell (`src/layouts/Layout.astro`) with HTML lang attribute, skip-link, GTM injection, View Transitions, canonical/hreflang tags, Open Graph and Twitter Card meta, and Schema.org structured data JSON-LD
    - Include favicon and web manifest link tags
    - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 1.2 Create page structure with Header, Hero, Quick Links, Calendar, Community Feed, Why Join, Who Comes, and Footer sections with correct anchor IDs
    - Implement `src/pages/index.astro` with `lang` prop defaulting to `"en"`
    - Implement `src/pages/ja/index.astro` re-using root page with `lang="ja"`
    - _Requirements: 1.1, 1.2, 1.6_
  - [x] 1.3 Implement Header with fixed nav and LanguagePicker component
    - LanguagePicker writes locale to `localStorage["kyoto-tech-language"]` with silent failure
    - _Requirements: 2.5_

- [x] 2. Bilingual i18n system
  - [x] 2.1 Configure Astro i18n routing with `en` as default locale and `ja` locale at `/ja/`
    - _Requirements: 2.1_
  - [x] 2.2 Implement client-side language detection and redirect script in Layout
    - Read localStorage, fall back to navigator.language, normalise paths, call location.replace()
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 2.3 Create i18n string tables (`src/i18n/ui.ts`) and `useTranslations` helper (`src/i18n/utils.ts`) with English fallback
    - _Requirements: 2.6, 2.7, 2.8_

- [x] 3. Meetup event fetching and calendar display
  - [x] 3.1 Implement Meetup scraper (`src/lib/meetup-events.ts`) — HTTP fetch with cache-busting, `__NEXT_DATA__` extraction, Apollo state parsing, 60-day + in-progress filtering, title normalisation, event type classification, error handling returning `[]`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 3.2 Implement event type classification (`src/lib/event-types.ts`) — priority-ordered rules: coffee → hack-day → special
    - _Requirements: 4.6_
  - [x] 3.3 Implement FullCalendar integration (`src/lib/full-calendar-events.ts`, `src/components/FullCalendarView.jsx`) — five-week grid, JST timezone, type-based styling, click-to-open Meetup URL
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.4 Create Calendar section (`src/components/Calendar.astro`) with legend cards, fallback message, Frequent Locations sub-section with Google Maps iframes, and FeedTimestamps island
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

- [x] 4. Community feed aggregation and display
  - [x] 4.1 Implement feed aggregator (`scripts/fetch-feeds.mjs`) — fetch RSS/Atom per source, YouTube channel ID resolution, item normalisation, image resolution priority chain, deduplication, `composite-feed.json` output with `--stale-ok` fallback
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  - [x] 4.2 Create Community Feed section UI — article cards per member feed, post cards with date/title/image/summary, empty state, error badge, FeedTimestamps island with last/next update
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 5. Community feed notifier
  - [x] 5.1 Implement notifier script (`scripts/community-feed-notifier.mjs`) — state read/write via Gist, first-run suppression, per-item delivery loop, Discord embed payload, generic webhook payload, immediate state persistence, CLI flags (--dry-run, --skip-without-destinations, --max-deliveries, --suppress-remaining-after-limit, --allow-initial-posts)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15_
  - [x] 5.2 Implement state migration (`scripts/lib/community-feed-notifier-state.mjs`) — v1→v2 re-keying of item IDs from `feedUrl::itemId` to `sourceId::itemId`
    - _Requirements: 8.16_

- [x] 6. Meetup event reminder notifier
  - [x] 6.1 Extend notifier state schema to version 3 — add top-level `events` and `weeklyDigest` maps to `defaultState()`, `parseState()`, and `migrateStateItemIds()` in `scripts/lib/community-feed-notifier-state.mjs`
    - _Requirements: 17.4, 17.5_
  - [x] 6.2 Extract Gist state read/write into shared helpers — `readStateFromGist` and `writeStateToGist` exported from `scripts/lib/community-feed-notifier-state.mjs`
    - _Requirements: 17.1, 17.3_
  - [x] 6.3 Create meetup event reminder script (`scripts/meetup-event-reminder.mjs`) — CLI flag parsing, destination/Gist-ID checks, `fetchMeetupEvents()` call with graceful empty/error handling
    - _Requirements: 17.1, 17.2, 17.3, 17.11_
  - [x] 6.4 Implement pre-event reminder logic — 24h and 1h window evaluation, Discord embed payload with emoji/venue/counts, immediate state write after each delivery
    - _Requirements: 17.6, 17.8, 17.9, 17.10, 17.12_
  - [x] 6.5 Implement weekly digest logic — JST day/time detection, ISO week computation, event filtering to Monday–Sunday bounds, single-embed digest payload, skip conditions
    - _Requirements: 17.7, 17.8, 17.9, 17.10, 17.12_

- [x] 7. Image optimisation pipeline
  - [x] 7.1 Implement image optimiser (`scripts/optimize-images.mjs`) — recursive processing under `public/images/`, resize to max 1600px, JPEG mozjpeg 85%, PNG compression level 9, raw backup, sentinel JSON tracking, `--check` mode, `--use-raw` mode
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 8. CI/CD workflows
  - [x] 8.1 Create PR build workflow (`.github/workflows/build.yml`) — Node 20, npm cache, `npm run check` + `npm run build`, concurrency cancel-in-progress per PR
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 8.2 Create scheduled rebuild workflow (`.github/workflows/scheduled-build.yml`) — cron every 3h, POST to Cloudflare deploy hook, workflow_dispatch
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 8.3 Create community feed notifier workflow (`.github/workflows/community-feed-notifier.yml`) — cron every 15min, workflow_dispatch with demo_mode/dry_run/allow_initial_posts inputs, concurrency cancel-in-progress false
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [x] 8.4 Create meetup event reminder workflow (`.github/workflows/meetup-event-reminder.yml`) — cron every 15min, workflow_dispatch with dry_run input (default true), concurrency cancel-in-progress false, `--skip-without-destinations` unconditional
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_
  - [x] 8.5 Create GitHub Pages redirect workflow (`.github/workflows/deploy-github-pages-redirect.yml`) — deploy `.github/redirect-site/` on push to main, redirect index.html and 404.html
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 9. Testing and code quality
  - [x] 9.1 Set up Vitest test suite with test files in `test/` using `.test.mjs` extension
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 9.2 Write tests for event type classification, full calendar events, meetup event title normalisation
    - _Requirements: 14.1, 14.5_
  - [x] 9.3 Write tests for community feed reader (normalisation, image resolution, YouTube handling)
    - _Requirements: 14.1, 14.5_
  - [x] 9.4 Write tests for notifier state (defaultState, parseState, upsertStateRecord, migrateStateItemIds v1→v2→v3, buildMessage, buildDiscordPayload)
    - _Requirements: 14.1, 14.5_
  - [x] 9.5 Write tests for meetup event reminder (buildReminderDiscordPayload, buildDigestDiscordPayload, computeIsoWeek, getJstWeekBounds, trigger-time logic)
    - _Requirements: 14.1, 14.5_
  - [x] 9.6 Configure ESLint flat config, TypeScript strict mode, Knip dead-code detection, and `npm run check` quality gate pipeline
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 10. Final verification
  - [x] 10.1 Ensure all tests pass, lint/tsc/astrocheck/images:check/knip pass, and `npm run build` completes successfully
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are complete. The full system (Requirements 1–18) is implemented and passing CI checks.
- Tasks marked with `*` would be optional test sub-tasks, but all testing is complete in this project.
- The project uses TypeScript/Astro for the site, Node ESM (`.mjs`) for automation scripts, and Vitest for testing.
- Known fragilities (Meetup scraper, YouTube channel ID resolution, Gist-backed state races) are documented in Requirements 16 and accepted as operational risks.
- The `tsx` loader is used at runtime to import TypeScript modules (`src/lib/meetup-events.ts`) from the Node ESM scripts.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.2"] },
    { "id": 2, "tasks": ["3.1", "3.3", "4.1", "7.1"] },
    { "id": 3, "tasks": ["3.4", "4.2", "5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3"] },
    { "id": 6, "tasks": ["6.4", "6.5"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 9, "tasks": ["10.1"] }
  ]
}
```
