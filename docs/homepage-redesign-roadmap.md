# Homepage Redesign Roadmap

Status: Active — PRs 1–3 merged; PR 4 ready for review
Primary audience: People considering their first Kyoto Tech Meetup  
Secondary audience: Existing community members looking for events, locations, conversations, and member work

## Goal

Redesign the homepage so a first-time visitor can understand the meetup and reach an RSVP as quickly as possible, while preserving the site's role as a useful community resource hub.

The redesign should replace generic, text-heavy marketing sections with concrete information, real community evidence, and direct actions. Existing members should be able to bypass newcomer-oriented content through clear navigation and task-based shortcuts.

## Audience priority

1. **New visitors:** Understand what the community is, see the next event, resolve first-time concerns, and RSVP.
2. **Existing members:** Find the calendar, Discord, locations, member posts, GitHub, and organizer contact information.

Prioritizing new visitors does not mean burying member resources. The homepage should guide new visitors through its visual order while allowing returning members to jump directly to resources from the fixed navigation.

## Target page structure

```text
Fixed navigation
  Next meetup · Calendar · Locations · Community Hub · Language · RSVP

Event-led hero
  Clear invitation · Next-event details · Direct RSVP · Community photograph

First-meetup expectations
  Three practical facts · Secondary RSVP

Community Hub
  Events · Discord · Locations · Member posts · GitHub · Contact

Upcoming events
  Mobile event list · Desktop calendar

Frequent locations
  Address and directions-first venue cards

Member feed
  Recent work with source attribution

Final invitation and footer
```

## Product and design principles

- Lead with the next action, not a description of the organization.
- Prefer concrete facts over broad claims such as “community” or “collaboration.”
- Show real people and real work rather than generic illustrations or venue-only imagery.
- Keep the primary newcomer path short: invitation, event details, expectations, RSVP.
- Give returning members persistent shortcuts instead of forcing them through the visual page order.
- Use one strong event card and one strong photograph rather than a collection of decorative cards.
- Keep English and Japanese experiences structurally and functionally equivalent.
- Do not state that events are free, beginner-friendly, accessible, or suitable for solo attendees until organizers confirm those claims.

## Delivery plan

| PR | Workstream | Depends on | Primary outcome |
| --- | --- | --- | --- |
| 1 | Locale and navigation foundations | None | Explicit locale choices work and mobile navigation exposes essential paths |
| 2 | Stale-safe Meetup event data | None | Static builds and the future hero have reliable event data |
| 3 | Event-led hero | PR 2 | New visitors see and can RSVP for the next event immediately |
| 4 | First-meetup onboarding | PR 3 | Generic end-of-page marketing sections are replaced with practical guidance |
| 5 | Community Hub and page order | PRs 1 and 4 | Returning members have task-based shortcuts and the page has a coherent narrative |
| 6 | Responsive events and locations | PRs 2 and 5 | Mobile event discovery and venue information become easier and lighter |
| 7 | Member feed refinement | PR 5 | Member work becomes authentic community evidence rather than a long set of carousels |
| 8 | Accessibility, performance, analytics, and final QA | PRs 3–7 | The complete journey is verified and measurable |

PR 1 and PR 2 can be developed in parallel. Later PRs should follow the dependency order above.

---

## PR 1: Locale and navigation foundations

### Objective

Remove current navigation friction before changing the visual hierarchy.

### Scope

- Respect explicit locale URLs. A visitor who opens `/ja/` must remain on the Japanese page.
- Restrict automatic language detection to an undecided first visit, or remove automatic redirects entirely.
- Keep a language control available at mobile widths.
- Replace generic navigation labels with task-oriented destinations.
- Fix the missing space in the English footer copyright.
- Preserve the existing canonical URLs, `hreflang` links, localized metadata, and localized internal anchors.

### Implementation notes

- Update the inline language-selection logic in `src/layouts/Layout.astro` so it never overrides an explicit Japanese route.
- Keep local storage only as a remembered choice, not as authority to redirect away from a URL the visitor deliberately opened.
- Refactor `src/components/LanguagePicker.astro` to provide a compact mobile presentation instead of hiding the picker below the `sm` breakpoint.
- Update `src/components/Header.astro` with destinations for the next meetup, calendar, locations, and Community Hub. The final header RSVP behavior will be connected in PR 3.
- Add an explicit whitespace node or formatted string in `src/components/Footer.astro`.
- Add or update both English and Japanese strings in `src/i18n/ui.ts`.

### Acceptance criteria

- Opening `/` does not unexpectedly bounce between locales.
- Opening `/ja/` always renders Japanese, regardless of browser language or a previously stored English preference.
- A language control is keyboard- and touch-accessible at 320px, 390px, tablet, and desktop widths.
- Switching languages preserves a valid localized homepage destination.
- Header content does not overflow at supported mobile widths.
- Canonical, Open Graph, and `hreflang` metadata remain correct for both routes.

### Verification

- Add unit coverage for any extracted locale-selection helper.
- Manually verify `/` and `/ja/` with no preference, an English preference, and a Japanese preference.
- Verify keyboard focus and mobile touch targets.
- Run `npm run check` and `npm run build`.

---

## PR 2: Stale-safe Meetup event data

### Objective

Make event data reliable enough to drive the hero without making every static build depend on a successful live Meetup response.

### Proposed data flow

```text
Meetup page
  ↓
events:pull:stale-ok
  ↓
src/data/meetup-events.json
  ↓
Astro pages, hero, event list, calendar, and structured data
```

### Scope

- Move live Meetup retrieval out of page rendering and into a dedicated data-generation script.
- Commit the most recent successful event JSON as the build fallback.
- Preserve the last successful file when Meetup is unavailable or its response cannot be parsed.
- Expose tested functions for selecting upcoming, ongoing, and next events.
- Prevent the English and Japanese static routes from fetching the same Meetup page independently.

### Implementation notes

- Add `scripts/fetch-meetup-events.mjs`.
- Generate `src/data/meetup-events.json` with at least:

  ```json
  {
    "generatedAt": "ISO-8601 timestamp",
    "events": []
  }
  ```

- Add `events:pull` and `events:pull:stale-ok` scripts to `package.json`.
- Run the stale-safe event pull before `astro build`, alongside the existing stale-safe feed pull.
- Add request timeouts, `response.ok` validation, parse guards, and useful log messages.
- Refactor `src/lib/meetup-events.ts` so normalization and date selection can run against supplied data and a supplied clock.
- Keep all user-facing event times in `Asia/Tokyo` and format them using `en-US` or `ja-JP` at the rendering boundary.
- Update `README.md` and `AGENTS.md` with the new generated-data workflow when this PR lands.

### Acceptance criteria

- A successful pull refreshes the generated file.
- A failed pull leaves the previous valid file usable and exits successfully in stale-ok mode.
- A strict pull fails clearly when it cannot produce valid data.
- `astro build` succeeds with outbound network access disabled when valid cached data exists.
- Ongoing events are retained, expired events are excluded, and the next event is deterministic.
- No upcoming event produces a deliberate empty-state result rather than an exception.

### Verification

- Unit-test successful parsing, malformed responses, non-2xx responses, request failures, stale fallback, event boundaries, and no-event behavior.
- Run a normal production build.
- Run a production build with Meetup unavailable and confirm the cached fallback is used.
- Run `npm run check`.

---

## PR 3: Event-led hero

### Objective

Turn the hero into the beginning of the joining journey: an invitation, a real view of the community, and a direct route to the next meetup.

### Desktop composition

- Use a candid community photograph as the full hero background rather than a separate image block.
- Layer concise copy and actions on the left and next-event details on the right, with intentional gradients preserving text contrast.
- Keep the image, copy, event details, and actions within one visually connected composition.

### Mobile composition

1. Headline and description
2. Next-event details
3. Primary RSVP
4. Reassurance line
5. Community photograph

Joining information must appear before the image on mobile.

### Scope

- Replace the current sparse hero layout.
- Connect the header and hero primary actions to the next event's direct RSVP URL.
- Provide a graceful fallback to the Meetup group when there is no upcoming event.
- Replace the remote Unsplash venue image with a curated photograph of an actual meetup.
- Remove or relocate the “100+ members” badge unless it can be maintained as a trustworthy fact.

### Implementation notes

- Extend `src/components/Hero.astro` to accept the localized copy and normalized `nextEvent` data.
- Add `src/components/NextEventCard.astro` because the same event summary may be reused later.
- Render date and time with semantic `<time datetime="...">` elements.
- Use the event's title, start time, venue, and link without duplicating formatting logic in the component.
- Store approved community photographs under `public/images`, process them with the repository image tooling, and render the selected hero background with explicit dimensions and contrast-preserving overlays.
- Load the hero image eagerly and avoid the current combination of lazy loading with high fetch priority.
- Add aligned English and Japanese strings in `src/i18n/ui.ts`.
- Keep the secondary action internal, such as “See all events,” pointing to `#calendar`.
- Prefer same-tab navigation for the primary RSVP unless there is a documented reason to open a new tab.

### Content direction

Working English direction:

- Heading: “Meet Kyoto's tech community.”
- Description: “Come for coffee, conversation, and hands-on building with people working across technology in Kyoto.”
- Primary action: “RSVP for the next meetup”
- Secondary action: “See all events”
- Reassurance: “English and Japanese welcome · First-timers encouraged”

The final English and Japanese copy should be reviewed by community organizers before merge. Claims such as “free to attend” or “come by yourself” should be added only after confirmation.

### Acceptance criteria

- A new visitor can see the next event's name, date, time, venue status, and RSVP action without reaching the full calendar.
- The primary action goes directly to the next event when one exists.
- No-event behavior links to the Meetup group and does not leave empty visual space.
- The key event action appears before the photograph on mobile.
- English and Japanese layouts remain balanced without clipped or overflowing text.
- The hero uses a real community image with appropriate alternative text.

### Verification

- Test hero rendering with a normal next event, missing venue, ongoing event, and no event.
- Capture English and Japanese screenshots at representative mobile, tablet, and desktop widths.
- Verify keyboard order, focus visibility, and link destinations.
- Run `npm run check` and `npm run build`.

---

## PR 4: First-meetup onboarding

### Objective

Replace the generic “Small, intentional gatherings” and “People who like to build in public” sections with compact, practical guidance for someone considering their first visit.

### Scope

- Remove both existing end-of-page sections and their persona list.
- Add one “Your first meetup?” section directly after the hero.
- Pair one event photograph with three concise, factual expectations.
- Add a second RSVP opportunity after the expectations.
- Move the language note into this onboarding context or the next-event card.

### Content direction

Working English direction:

> Come on your own or with a friend—grab a seat, say hello, and take part at your own pace.

- Most meetups favor conversation and making together over formal presentations.
- English and Japanese are both welcome; use whichever feels comfortable.
- Bring a project, a question, or simply your curiosity.

All statements must be checked against how events actually operate before merge.

### Implementation notes

- Add the section near the hero in `src/pages/index.astro`; avoid creating a new abstraction unless the section develops reusable logic.
- Add aligned English and Japanese translation keys.
- Remove the old `WhyJoin` usage and delete `src/components/WhyJoin.astro` once it is unused.
- Remove obsolete `home.benefit*`, `home.whoComes.*`, and related keys only after both locales have been updated together.
- Use a real event image with responsive image handling and intentional crop behavior.

### Acceptance criteria

- Neither old generic section remains on the page.
- The replacement uses no more than one short paragraph and three short facts.
- The section explains the experience without relying on professional personas.
- A direct RSVP action is available at the end of the section.
- Content is equivalent and reviewed in English and Japanese.

### Verification

- Check heading hierarchy after removing the old sections.
- Verify text wrapping and image crop on mobile and desktop.
- Run Knip through `npm run check` to confirm removed code and strings have no stale references.
- Run `npm run build`.

---

## PR 5: Community Hub and page order

### Objective

Give existing members fast, task-oriented access to resources without interrupting the newcomer joining path.

### Scope

- Move the current quick links below the first-meetup onboarding section.
- Rename the section to “Community Hub.”
- Mix internal destination links with external community services.
- Reorder the remainder of the homepage according to the target structure.
- Add a fixed-navigation destination for the hub.
- Restore a compact community-size signal near the hub introduction, backed by Meetup data rather than a hard-coded claim.

### Suggested shortcuts

- Upcoming events → `#calendar`
- Discord → community Discord
- Frequent locations → `#locations`
- Member posts → `#community-feed`
- GitHub → community GitHub organization
- Contact organizers → contact form

### Implementation notes

- Rename `#quick-links` to `#community-hub` in `src/pages/index.astro`.
- Update the link data to describe tasks rather than repeat service names alone.
- Show external-link indicators only for external destinations.
- Keep the link cards concise; one label and, at most, one short supporting line.
- Update header anchors and localized navigation strings.
- Keep the homepage as a single-page experience for now. A separate member hub route is out of scope unless the resource set grows materially.

### Meetup member milestone

- Extend the stale-safe Meetup pull so `src/data/meetup-events.json` can retain a validated top-level `memberCount` alongside the event snapshot.
- Preserve the last valid member count when Meetup is unavailable or the count cannot be parsed; a count failure must not discard otherwise valid event data.
- Convert the exact count to a conservative public milestone by rounding down to the nearest 25. For example, counts from 225 through 249 render as “225+ members and growing.”
- Do not render the module when there is no valid cached count or the rounded milestone is below 25.
- Keep the module out of the event-led hero. Place it as concise community-level social proof near the Community Hub introduction.
- Add aligned English and Japanese strings, and keep formatting in a small tested helper rather than embedding rounding logic in the template.

### Acceptance criteria

- A returning visitor can reach every core resource from either the header or Community Hub.
- The newcomer path remains hero → expectations → RSVP before the resource hub begins.
- Internal and external destinations are visually distinguishable without excessive decoration.
- Mobile navigation exposes the same essential destinations as desktop navigation.
- Anchor destinations account for the fixed header and do not hide section headings.
- The member milestone never overstates the Meetup count and remains usable from stale cached data.

### Verification

- Verify all internal anchors in both locales.
- Verify all external destinations and accessible names.
- Test keyboard and touch navigation at supported breakpoints.
- Unit-test member-count parsing and milestone boundaries including 224, 225, 249, and 250.
- Run `npm run check` and `npm run build`.

---

## PR 6: Responsive events and locations

### Objective

Preserve the detailed calendar for existing members while giving mobile visitors a faster, more legible way to find an event and practical venue information.

### Mobile event list

- Add a server-rendered `src/components/UpcomingEventList.astro`.
- Show the next three to six events chronologically.
- Include date, time, venue status, event type, and a direct RSVP action.
- Render the list at mobile widths and retain the existing server-rendered calendar grid at tablet and desktop widths.
- Preserve a useful no-events state linking to the Meetup group.

### Happening-now state

- Preserve the existing `NextEventCard.astro` behavior, which already renders “Live Now” / “開催中” with an active green status dot when `getHeroEventState` identifies an ongoing event.
- Move `isOngoingEvent` out of the hero-specific helper into shared event logic so the hero, upcoming-event list, and calendar use the same start, end, and four-hour missing-end-time grace rules.
- Restore an obvious active treatment in the upcoming-event list based on the former `EventList.jsx` design: a live badge plus an emphasized card edge or restrained pulse.
- Mark the same event as active wherever it appears in the desktop calendar grid.
- Respect `prefers-reduced-motion`; the badge and non-motion styling must communicate the state without relying on animation.
- Server-render the initial state. Add only a small time-aware client enhancement if needed so the label changes when a visitor keeps the page open across an event start or end; do not reintroduce a fully hydrated event-list component solely for this behavior.

### Location cards

- Extend `src/data/event-locations.json` with structured `address`, `mapsUrl`, and localized transit or access notes where available.
- Replace always-loaded map iframes with address- and directions-first venue cards.
- If embedded maps remain desirable, load them only after an explicit visitor action.
- Keep the warning that event listings are the authority for the actual venue.

### Acceptance criteria

- A 320px or 390px visitor can discover and open upcoming events without horizontally panning an 864px calendar.
- The desktop calendar retains its current event coverage and localized labels.
- Mobile visitors do not load an unnecessary calendar client island.
- Ongoing events use the localized live label and active styling in the hero, mobile list, and desktop calendar without duplicating timing rules.
- The live state remains understandable with reduced motion enabled.
- Venue cards provide an address and direct maps link without requiring an embedded map.
- Both locales render dates, labels, and venue guidance correctly.

### Verification

- Test event cards with long titles, missing venues, overlapping events, ongoing events, and no events.
- Test live-state boundaries for explicit end times and the four-hour fallback window.
- Confirm list/calendar switching at and around the 768px breakpoint.
- Verify the active treatment with reduced motion enabled and while crossing a start or end time with the page open.
- Verify the page with third-party maps blocked.
- Run responsive accessibility checks, `npm run check`, and `npm run build`.

---

## PR 7: Member feed refinement

### Objective

Use member work as authentic evidence of the community and reduce the length and interaction cost of the current per-source horizontal carousels.

### Scope

- Rename the section around the idea of work made by people in the community.
- Present a consolidated set of the latest posts across sources, ordered by publication date.
- Preserve source attribution and original-language titles and summaries.
- Limit the initial presentation to a manageable number of posts.
- End the section with an invitation to meet the people behind the work at the next event.

### Implementation notes

- Flatten the normalized feed entries into one sorted collection in `src/pages/index.astro` or a small pure helper.
- Start with six recent posts; adjust only after reviewing real content density on mobile and desktop.
- Use a responsive grid rather than nested horizontal scrollers.
- Use `h3` for member or post-group headings under the section's `h2`; do not skip directly to `h4`.
- Keep original source links readily available for existing members.
- Do not machine-translate member-authored content as part of this work.

### Acceptance criteria

- The section does not require horizontal scrolling.
- Recent work from different members appears without one source dominating solely because of source order.
- Every item clearly identifies its source and publication date.
- The section has a clear link back to the next meetup.
- Empty and failed-feed states remain understandable.

### Verification

- Unit-test flattening, sorting, per-source attribution, invalid dates, and empty feeds.
- Verify long English and Japanese-adjacent source content does not overflow cards.
- Check image loading, alternative text, heading hierarchy, and focus states.
- Run `npm run check` and `npm run build`.

---

## PR 8: Accessibility, performance, analytics, and final QA

### Objective

Verify the complete newcomer and member journeys, remove remaining technical friction, and establish signals for whether the redesign is working.

Accessibility is not deferred to this PR: every earlier PR must meet baseline accessibility requirements. This PR is the final cross-page audit.

### Accessibility work

- Verify a logical heading hierarchy.
- Add consistent `focus-visible` treatment to interactive elements.
- Ensure touch targets are at least 44px where practical.
- Respect `prefers-reduced-motion` before applying smooth scrolling or motion effects.
- Verify keyboard access to navigation, language selection, event actions, hub links, and feed items.
- Check color contrast, meaningful image alternatives, decorative-image handling, and semantic event times.
- Verify the page at 200% zoom and common narrow widths.

### Performance work

- Confirm the hero uses responsive local image assets and has stable dimensions.
- Confirm Google Maps does not load until requested, if retained at all.
- Confirm FullCalendar does not hydrate on mobile.
- Remove duplicate client islands or scripts made unnecessary by the redesign.
- Measure production output and address regressions in LCP, CLS, and interaction responsiveness.
- Verify a cached-data production build without network access.

### Structured data and metadata

- Preserve localized canonical URLs, Open Graph tags, and `hreflang` links.
- Generate actual upcoming `Event` structured data from normalized event records where complete enough to be valid.
- Retain the existing organization and website structured data.

### Analytics

Use the existing Google Tag Manager integration. Do not add another analytics dependency.

Suggested events:

- `hero_rsvp_click`
- `header_rsvp_click`
- `next_event_view`
- `language_switch`
- `community_hub_click`
- `calendar_event_click`
- `discord_click`

Use stable `data-*` attributes or a small shared helper so tracking does not depend on visible text. Do not include personal information in analytics payloads.

### Acceptance criteria

- A keyboard-only visitor can complete the RSVP path and access all hub resources.
- English and Japanese journeys behave equivalently.
- There is no page-level horizontal overflow at supported widths.
- The production build succeeds from cached feed and event data when external sources are unavailable.
- Core CTA and hub interactions emit documented analytics events once each.
- No serious accessibility issue or material performance regression remains.

### Verification

- Run the full `npm run check` suite and production build.
- Test desktop and mobile in English and Japanese.
- Test with JavaScript disabled for the server-rendered core journey.
- Test with Meetup, feed sources, maps, and analytics blocked independently.
- Perform keyboard, screen-reader-oriented DOM, reduced-motion, zoom, and contrast checks.
- Capture final screenshots for PR review.

## Cross-cutting pull request requirements

Every PR in this roadmap should:

- Keep English and Japanese translation keys aligned in `src/i18n/ui.ts`.
- Avoid inline user-facing strings in components when a translation key is appropriate.
- Preserve unrelated community feed and notification behavior.
- Avoid adding dependencies unless the existing Astro, React, Tailwind, and platform capabilities are insufficient.
- Include tests for new pure logic and failure behavior.
- Include English and Japanese screenshots when the UI changes.
- Verify representative mobile and desktop widths.
- Run `npm run check` and `npm run build` before review.
- Update this roadmap's status when its workstream merges.

## Decisions requiring organizer input

These decisions should not block PR 1 or PR 2, but they must be resolved before their related visual PR merges:

- Select and approve one candid community photograph for the hero.
- Select a second photograph for first-meetup onboarding, or decide to reuse the hero image with a different crop.
- Approve final English hero and onboarding copy.
- Review the Japanese copy for tone rather than literal equivalence alone.
- Confirm whether events are consistently free, whether solo attendance should be explicitly encouraged, and what accessibility claims are supportable.
- Decide whether map embeds should be removed entirely or offered through click-to-load behavior.
- Confirm the initial number of member posts to display.

## Non-goals for this roadmap

- A full brand identity replacement
- A CMS migration
- A member login or private portal
- Machine translation of member-authored posts
- Replacing Meetup as the RSVP system
- Splitting the Community Hub into a separate route before the resource set requires it

## Definition of success

The redesign is successful when:

- A new visitor can identify and reach the next meetup's RSVP from the first viewport.
- First-time concerns are answered with concise, factual guidance instead of generic marketing copy.
- Returning members can reach core resources directly from navigation or the Community Hub.
- The mobile event experience does not depend on horizontal calendar scrolling.
- Real event imagery and member work provide the page's primary social proof.
- Both locale routes respect explicit visitor choice.
- Static builds remain usable when Meetup or feed sources are temporarily unavailable.
