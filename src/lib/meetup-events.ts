/* global fetch, URL, AbortController, setTimeout, clearTimeout */
import { classifyEventType, type EventType } from "./event-types";

export const DEFAULT_MEETUP_EVENTS_URL =
  "https://www.meetup.com/kyoto-tech-meetup/events/";
export const DEFAULT_MEETUP_TIMEOUT_MS = 12000;

const DEFAULT_EVENT_WINDOW_DAYS = 60;
const DEFAULT_IN_PROGRESS_GRACE_MS = 4 * 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EVENT_TYPES = new Set<EventType>(["coffee", "hack-day", "special"]);
const coffeeWeekdaySuffixPattern =
  /\s+on\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;

export type MeetupEvent = {
  title: string;
  link: string;
  start: string;
  endTime: string | null;
  description: string;
  image: string | null;
  goingCount: number;
  interestedCount: number;
  eventType: EventType;
  venue: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  } | null;
};

export function buildMeetupVenueMapsUrl(
  venue: MeetupEvent["venue"],
): string | null {
  const address = venue?.address?.trim();
  if (!address) return null;

  const query = [
    venue?.name,
    address,
    venue?.city,
    venue?.state,
    venue?.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type FetchLike = typeof fetch;

type FetchMeetupEventsOptions = {
  eventsUrl?: string;
  fetchFn?: FetchLike;
  now?: Date;
  timeoutMs?: number;
};

type SelectMeetupEventsOptions = {
  inProgressGraceMs?: number;
  now?: Date;
  windowDays?: number;
};

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).valueOf());
}

function isMeetupVenue(value: unknown): value is NonNullable<MeetupEvent["venue"]> {
  if (!value || typeof value !== "object") return false;
  const venue = value as Record<string, unknown>;
  return (
    isOptionalString(venue.name) &&
    isOptionalString(venue.address) &&
    isOptionalString(venue.city) &&
    isOptionalString(venue.state) &&
    isOptionalString(venue.country)
  );
}

export function isMeetupEvent(value: unknown): value is MeetupEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;

  return (
    typeof event.title === "string" &&
    event.title.length > 0 &&
    typeof event.link === "string" &&
    event.link.length > 0 &&
    isValidDateString(event.start) &&
    (event.endTime === null || isValidDateString(event.endTime)) &&
    typeof event.description === "string" &&
    (event.image === null || typeof event.image === "string") &&
    typeof event.goingCount === "number" &&
    Number.isFinite(event.goingCount) &&
    typeof event.interestedCount === "number" &&
    Number.isFinite(event.interestedCount) &&
    typeof event.eventType === "string" &&
    EVENT_TYPES.has(event.eventType as EventType) &&
    (event.venue === null || isMeetupVenue(event.venue))
  );
}

export function normalizeMeetupEventTitle(title: string): string {
  const titleWithoutGroupSuffix = title.replace(" | Kyoto Tech Meetup", "");

  if (classifyEventType(titleWithoutGroupSuffix) !== "coffee") {
    return titleWithoutGroupSuffix;
  }

  return titleWithoutGroupSuffix.replace(coffeeWeekdaySuffixPattern, "");
}

function compareMeetupEvents(a: MeetupEvent, b: MeetupEvent): number {
  const startDifference =
    new Date(a.start).valueOf() - new Date(b.start).valueOf();
  if (startDifference !== 0) return startDifference;

  const linkDifference = a.link.localeCompare(b.link);
  return linkDifference !== 0 ? linkDifference : a.title.localeCompare(b.title);
}

export function parseMeetupEventsHtml(html: string): MeetupEvent[] {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match?.[1]) {
    throw new Error("Meetup response did not contain __NEXT_DATA__.");
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error("Meetup response contained invalid __NEXT_DATA__ JSON.", {
      cause: error,
    });
  }

  const apolloState = data?.props?.pageProps?.__APOLLO_STATE__ as
    | Record<string, any>
    | undefined;
  if (!apolloState || typeof apolloState !== "object") {
    throw new Error("Meetup response did not contain Apollo event data.");
  }

  const resolvePhotoUrl = (photoLike: any): string | null => {
    const ref =
      typeof photoLike === "string" && photoLike.startsWith("PhotoInfo:")
        ? photoLike
        : (photoLike?.__ref ??
          (photoLike?.id ? `PhotoInfo:${photoLike.id}` : null));

    if (!ref) return null;
    const photo = apolloState[ref];
    if (!photo) return null;

    return (
      photo.highResUrl ??
      photo.source ??
      (photo.baseUrl && photo.id ? `${photo.baseUrl}${photo.id}` : null)
    );
  };

  const resolveVenue = (venueLike: any): MeetupEvent["venue"] => {
    const ref =
      typeof venueLike === "string" && venueLike.startsWith("Venue:")
        ? venueLike
        : (venueLike?.__ref ??
          (venueLike?.id ? `Venue:${venueLike.id}` : null));

    const venue = ref ? apolloState[ref] : venueLike;
    if (!venue) return null;

    return {
      name: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      country: venue.country,
    };
  };

  const resolveSocialProofInsights = (socialProofLike: any) => {
    const ref =
      typeof socialProofLike === "string" &&
      socialProofLike.startsWith("SocialProofInsights:")
        ? socialProofLike
        : (socialProofLike?.__ref ??
          (socialProofLike?.id
            ? `SocialProofInsights:${socialProofLike.id}`
            : null));

    const socialProof = ref ? apolloState[ref] : socialProofLike;
    if (!socialProof) return null;

    return {
      interested:
        socialProof.totalInterestedUsers ?? socialProof.totalInterested ?? null,
      going: socialProof.totalGoingUsers ?? socialProof.totalGoing ?? null,
    };
  };

  const resolveGoingCount = (goingLike: any): number | null => {
    if (!goingLike) return null;
    if (typeof goingLike.totalCount === "number") return goingLike.totalCount;

    if (typeof goingLike.__ref === "string") {
      const resolved = apolloState[goingLike.__ref];
      if (resolved && typeof resolved.totalCount === "number") {
        return resolved.totalCount;
      }
    }

    return null;
  };

  return Object.entries(apolloState)
    .filter(
      ([key, value]) => key.startsWith("Event:") && (value as any)?.dateTime,
    )
    .map(([, rawValue]) => {
      const value = rawValue as any;
      const title = normalizeMeetupEventTitle(value.title ?? "");
      const socialProof = resolveSocialProofInsights(value.socialProofInsights);
      const goingCount =
        resolveGoingCount(value.going) ?? socialProof?.going ?? 0;

      return {
        title,
        link: value.eventUrl,
        start: value.dateTime,
        endTime: value.endTime ?? null,
        description: value.description ?? "",
        image: resolvePhotoUrl(value.featuredEventPhoto),
        goingCount,
        interestedCount: socialProof?.interested ?? 0,
        venue: resolveVenue(value.venue),
        eventType: classifyEventType(title),
      };
    })
    .filter(isMeetupEvent)
    .sort(compareMeetupEvents);
}

export function selectUpcomingMeetupEvents(
  events: readonly MeetupEvent[],
  {
    inProgressGraceMs = DEFAULT_IN_PROGRESS_GRACE_MS,
    now = new Date(),
    windowDays = DEFAULT_EVENT_WINDOW_DAYS,
  }: SelectMeetupEventsOptions = {},
): MeetupEvent[] {
  const nowMs = now.valueOf();
  if (Number.isNaN(nowMs)) {
    throw new Error("Cannot select Meetup events with an invalid current date.");
  }

  const cutoffMs = nowMs + windowDays * MILLISECONDS_PER_DAY;

  return events
    .filter(isMeetupEvent)
    .filter((event) => {
      const startMs = new Date(event.start).valueOf();
      const endMs = event.endTime
        ? new Date(event.endTime).valueOf()
        : null;
      const upcoming = startMs >= nowMs;
      const inProgress =
        startMs <= nowMs &&
        (endMs !== null
          ? endMs >= nowMs
          : nowMs - startMs <= inProgressGraceMs);

      return (upcoming || inProgress) && startMs <= cutoffMs;
    })
    .sort(compareMeetupEvents);
}

export function selectNextMeetupEvent(
  events: readonly MeetupEvent[],
  options: SelectMeetupEventsOptions = {},
): MeetupEvent | null {
  return selectUpcomingMeetupEvents(events, options)[0] ?? null;
}

export async function fetchMeetupEvents({
  eventsUrl = DEFAULT_MEETUP_EVENTS_URL,
  fetchFn = fetch,
  now = new Date(),
  timeoutMs = DEFAULT_MEETUP_TIMEOUT_MS,
}: FetchMeetupEventsOptions = {}): Promise<MeetupEvent[]> {
  const requestUrl = new URL(eventsUrl);
  requestUrl.searchParams.set("_cb", String(now.valueOf()));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, timeoutMs),
  );

  try {
    const response = await fetchFn(requestUrl, {
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Meetup request failed for ${requestUrl.origin}${requestUrl.pathname}: HTTP ${response.status}`,
      );
    }

    const events = parseMeetupEventsHtml(await response.text());
    return selectUpcomingMeetupEvents(events, { now });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Meetup request timed out after ${timeoutMs}ms.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
