import { describe, expect, test, vi } from "vitest";
import {
  fetchMeetupEvents,
  isMeetupEvent,
  normalizeMeetupEventTitle,
  parseMeetupEventsHtml,
  selectNextMeetupEvent,
  selectUpcomingMeetupEvents,
} from "../src/lib/meetup-events.ts";

const fixedNow = new Date("2026-07-10T03:00:00.000Z");

function makeMeetupEvent(overrides = {}) {
  return {
    title: "Community Event",
    link: "https://www.meetup.com/kyoto-tech-meetup/events/default/",
    start: "2026-07-18T01:00:00.000Z",
    endTime: "2026-07-18T03:00:00.000Z",
    description: "",
    image: null,
    goingCount: 0,
    interestedCount: 0,
    eventType: "special",
    venue: null,
    ...overrides,
  };
}

function makeMeetupHtml(apolloState) {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { __APOLLO_STATE__: apolloState } },
  })}</script></body></html>`;
}

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

test("normalizeMeetupEventTitle removes weekday suffixes from coffee event titles", () => {
  expect(normalizeMeetupEventTitle("Morning Tech & Coffee on Saturday")).toBe(
    "Morning Tech & Coffee",
  );
  expect(normalizeMeetupEventTitle("Morning Tech & Coffee on Thursday")).toBe(
    "Morning Tech & Coffee",
  );
});

test("normalizeMeetupEventTitle keeps non-coffee titles unchanged", () => {
  expect(normalizeMeetupEventTitle("Community Hack Day")).toBe(
    "Community Hack Day",
  );
});

test("parseMeetupEventsHtml resolves referenced Meetup event data", () => {
  const events = parseMeetupEventsHtml(
    makeMeetupHtml({
      "Event:event-1": {
        title: "Morning Tech & Coffee on Saturday | Kyoto Tech Meetup",
        eventUrl: "https://www.meetup.com/kyoto-tech-meetup/events/event-1/",
        dateTime: "2026-07-18T01:00:00.000Z",
        endTime: "2026-07-18T03:00:00.000Z",
        description: "Coffee and conversation",
        featuredEventPhoto: { __ref: "PhotoInfo:photo-1" },
        going: { __ref: "Going:going-1" },
        socialProofInsights: { __ref: "SocialProofInsights:social-1" },
        venue: { __ref: "Venue:venue-1" },
      },
      "PhotoInfo:photo-1": {
        highResUrl: "https://example.com/event.jpg",
      },
      "Going:going-1": { totalCount: 12 },
      "SocialProofInsights:social-1": { totalInterestedUsers: 20 },
      "Venue:venue-1": {
        name: "FabCafe Kyoto",
        address: "554 Motoshiogamacho",
        city: "Kyoto",
        country: "JP",
      },
    }),
  );

  expect(events).toEqual([
    {
      title: "Morning Tech & Coffee",
      link: "https://www.meetup.com/kyoto-tech-meetup/events/event-1/",
      start: "2026-07-18T01:00:00.000Z",
      endTime: "2026-07-18T03:00:00.000Z",
      description: "Coffee and conversation",
      image: "https://example.com/event.jpg",
      goingCount: 12,
      interestedCount: 20,
      eventType: "coffee",
      venue: {
        name: "FabCafe Kyoto",
        address: "554 Motoshiogamacho",
        city: "Kyoto",
        country: "JP",
      },
    },
  ]);
});

describe("Meetup event selection", () => {
  test("keeps upcoming and ongoing events while excluding expired and distant events", () => {
    const events = selectUpcomingMeetupEvents(
      [
        makeMeetupEvent({
          title: "Ongoing with end time",
          link: "https://example.com/ongoing",
          start: "2026-07-10T02:00:00.000Z",
          endTime: "2026-07-10T04:00:00.000Z",
        }),
        makeMeetupEvent({
          title: "Ongoing with grace period",
          link: "https://example.com/grace",
          start: "2026-07-10T01:00:00.000Z",
          endTime: null,
        }),
        makeMeetupEvent({
          title: "Expired",
          link: "https://example.com/expired",
          start: "2026-07-10T00:00:00.000Z",
          endTime: "2026-07-10T02:59:59.000Z",
        }),
        makeMeetupEvent({
          title: "Upcoming",
          link: "https://example.com/upcoming",
          start: "2026-07-20T03:00:00.000Z",
        }),
        makeMeetupEvent({
          title: "Outside window",
          link: "https://example.com/distant",
          start: "2026-09-10T03:00:01.000Z",
        }),
      ],
      { now: fixedNow },
    );

    expect(events.map((event) => event.title)).toEqual([
      "Ongoing with grace period",
      "Ongoing with end time",
      "Upcoming",
    ]);
  });

  test("selects the next event deterministically and returns null when empty", () => {
    const sameStart = "2026-07-18T01:00:00.000Z";
    const events = [
      makeMeetupEvent({
        title: "Second by link",
        link: "https://example.com/b",
        start: sameStart,
      }),
      makeMeetupEvent({
        title: "First by link",
        link: "https://example.com/a",
        start: sameStart,
      }),
    ];

    expect(selectNextMeetupEvent(events, { now: fixedNow })?.link).toBe(
      "https://example.com/a",
    );
    expect(selectNextMeetupEvent([], { now: fixedNow })).toBeNull();
  });
});

describe("fetchMeetupEvents", () => {
  test("returns a deliberate empty event list for valid empty Meetup data", async () => {
    const fetchFn = vi.fn(async () => makeResponse(200, makeMeetupHtml({})));

    await expect(fetchMeetupEvents({ fetchFn, now: fixedNow })).resolves.toEqual(
      [],
    );
  });

  test("rejects non-success responses", async () => {
    const fetchFn = vi.fn(async () => makeResponse(503, "Unavailable"));

    await expect(fetchMeetupEvents({ fetchFn, now: fixedNow })).rejects.toThrow(
      "HTTP 503",
    );
  });

  test("rejects malformed Meetup responses", async () => {
    const fetchFn = vi.fn(async () => makeResponse(200, "<html></html>"));

    await expect(fetchMeetupEvents({ fetchFn, now: fixedNow })).rejects.toThrow(
      "did not contain __NEXT_DATA__",
    );
  });

  test("propagates request failures", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(fetchMeetupEvents({ fetchFn, now: fixedNow })).rejects.toThrow(
      "network unavailable",
    );
  });

  test("aborts requests that exceed the timeout", async () => {
    const fetchFn = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      fetchMeetupEvents({ fetchFn, now: fixedNow, timeoutMs: 5 }),
    ).rejects.toThrow("timed out after 5ms");
  });
});

test("isMeetupEvent rejects malformed cache entries", () => {
  expect(isMeetupEvent(makeMeetupEvent())).toBe(true);
  expect(isMeetupEvent({ title: "Missing fields" })).toBe(false);
  expect(isMeetupEvent(makeMeetupEvent({ start: "not-a-date" }))).toBe(false);
});
