# Homepage analytics events

The homepage uses the existing Google Tag Manager container. Links declare a stable `data-analytics-event` value, and the shared listener in `src/layouts/Layout.astro` pushes one object to `window.dataLayer` for each click.

No visible copy, URL query data, event title, member name, or other personal information is sent by this listener.

| Event | Interaction | `link_name` examples | `link_location` examples |
| --- | --- | --- | --- |
| `hero_rsvp_click` | Primary hero RSVP or Meetup fallback | `next_event`, `meetup_group` | `hero` |
| `header_rsvp_click` | Fixed-navigation event action | `next_event`, `meetup_group` | `header` |
| `next_event_view` | Hero calendar or event-details link | `calendar`, `event_details`, `meetup_group` | `hero`, `hero_event_card` |
| `language_switch` | English/Japanese language choice | `en`, `ja` | `header`, `mobile_navigation` |
| `community_hub_click` | Community or footer resource link | `meetup`, `discord`, `github`, `linkedin`, `contact` | `community_hub`, `footer` |
| `calendar_event_click` | Event, RSVP, or Maps action | `coffee`, `hack-day`, `special`, `rsvp`, `maps` | `desktop_calendar`, `mobile_event_list`, `hero_event_card`, `first_meetup` |
| `discord_click` | Footer Discord link | `discord` | `footer` |
| `feed_submission_click` | GitHub feed-list edit action | `github_edit` | `community_feed` |

## GTM configuration

Create Custom Event triggers using the event names above. Read `link_name` and `link_location` as Data Layer Variables when a report needs destination or placement breakdowns. The site owns the event contract; GTM should not use visible link text or CSS selectors as triggers.

Blocked or unavailable analytics must not affect navigation. The local event listener initializes `window.dataLayer` when GTM is unavailable, and every link remains an ordinary server-rendered anchor.
