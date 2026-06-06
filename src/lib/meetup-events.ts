/* global fetch, URL */
import { classifyEventType, type EventType } from "./event-types";

const EVENTS_URL = "https://www.meetup.com/kyoto-tech-meetup/events/";
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

export function normalizeMeetupEventTitle(title: string): string {
  const titleWithoutGroupSuffix = title.replace(" | Kyoto Tech Meetup", "");

  if (classifyEventType(titleWithoutGroupSuffix) !== "coffee") {
    return titleWithoutGroupSuffix;
  }

  return titleWithoutGroupSuffix.replace(coffeeWeekdaySuffixPattern, "");
}

export async function fetchMeetupEvents(): Promise<MeetupEvent[]> {
  const requestUrl = new URL(EVENTS_URL);
  requestUrl.searchParams.set("_cb", String(Date.now()));

  const html = await fetch(requestUrl.toString(), {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "accept-language": "en-US,en;q=0.9",
    },
  }).then((r) => r.text());

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match?.[1]) return [];

  const data = JSON.parse(match[1]);
  const apolloState = data?.props?.pageProps?.__APOLLO_STATE__ as
    | Record<string, any>
    | undefined;
  if (!apolloState) return [];

  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 60);
  const inProgressGraceMs = 4 * 60 * 60 * 1000;

  const resolvePhotoUrl = (photoLike: any) => {
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

  const resolveVenue = (venueLike: any) => {
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

  const resolveGoingCount = (goingLike: any) => {
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
    .filter((evt) => {
      const start = new Date(evt.start);
      const end = evt.endTime ? new Date(evt.endTime) : null;
      const upcoming = start >= now;
      const inProgress = end
        ? start <= now && end >= now
        : start <= now && now.valueOf() - start.valueOf() <= inProgressGraceMs;
      return (upcoming || inProgress) && start <= cutoff;
    })
    .sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf());
}
