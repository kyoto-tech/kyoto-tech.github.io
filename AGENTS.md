# AGENTS.md

## Purpose
This repo is the Astro-powered marketing site for the Kyoto Tech Meetup community.

## Key References (Read First)
- `README.md` for setup, scripts, and contribution workflow.
- i18n strings and locale wiring:
  - `src/i18n/ui.ts` (string tables + default language)
  - `src/i18n/utils.ts` (translation helper + fallback behavior)
  - `astro.config.mjs` (Astro i18n locales/default)
  - `src/pages/index.astro` and `src/pages/ja/index.astro` (locale routing)
  - `src/components/LanguagePicker.astro` and `src/layouts/Layout.astro` (language switch + meta)
- RSS/community feed JSON:
  - `src/data/member-feeds.json` (source list)
  - `src/data/composite-feed.json` (generated output consumed by UI)
  - `scripts/fetch-feeds.mjs` (RSS aggregator that writes the JSON above)

## Quick Start
- Install: `npm install`
- Dev server: `npm run dev` (http://localhost:4321)
- Checks: `npm run check`
- Build: `npm run build`
- Preview: `npm run preview`

## i18n Rules
- Add/modify strings in `src/i18n/ui.ts` under both `en` and `ja`.
- Keep keys aligned across locales; `useTranslations` falls back to `defaultLang`.
- Prefer `useTranslations(lang)` in Astro/React components instead of inline strings.
- New locale pages should mirror the base page structure (`src/pages/ja/...`).

## Editing Guidelines
- Keep Tailwind usage consistent with existing patterns.
- Prefer editing existing Astro/React components over adding new ones.
- Do not edit `dist/` (build output).
- If adding dependencies, update both `package.json` and `package-lock.json`.

## Data Notes
- `src/data/composite-feed.json` is generated; update via `scripts/fetch-feeds.mjs`.
- `src/data/member-feeds.json` is the source-of-truth for aggregated RSS feeds.
