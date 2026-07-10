/* global URL */
import type { MeetupEvent } from "./meetup-events";

const isHttpsUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export function buildEventStructuredData(
  events: MeetupEvent[],
  siteUrl: string,
) {
  return events.flatMap((event) => {
    const venueName = event.venue?.name?.trim();
    const venueAddress = event.venue?.address?.trim();
    if (
      !event.title.trim() ||
      Number.isNaN(new Date(event.start).valueOf()) ||
      !isHttpsUrl(event.link) ||
      (!venueName && !venueAddress)
    ) {
      return [];
    }

    return [
      {
        "@type": "Event",
        "@id": `${event.link}#event`,
        name: event.title,
        startDate: event.start,
        ...(event.endTime ? { endDate: event.endTime } : {}),
        url: event.link,
        eventAttendanceMode:
          "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        ...(isHttpsUrl(event.image) ? { image: [event.image] } : {}),
        location: {
          "@type": "Place",
          ...(venueName ? { name: venueName } : {}),
          ...(venueAddress
            ? {
                address: {
                  "@type": "PostalAddress",
                  streetAddress: venueAddress,
                  ...(event.venue?.city
                    ? { addressLocality: event.venue.city }
                    : {}),
                  ...(event.venue?.state
                    ? { addressRegion: event.venue.state }
                    : {}),
                  ...(event.venue?.country
                    ? { addressCountry: event.venue.country }
                    : {}),
                },
              }
            : {}),
        },
        organizer: { "@id": `${siteUrl}/#org` },
      },
    ];
  });
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
