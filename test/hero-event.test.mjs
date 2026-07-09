import { describe, expect, test } from "vitest";
import { getHeroEventState } from "../src/lib/hero-event.ts";

const fixedNow = new Date("2026-07-10T03:00:00.000Z");
const fallbackUrl = "https://www.meetup.com/kyoto-tech-meetup/";

function makeEvent(overrides = {}) {
  return {
    title: "Morning Tech & Coffee",
    link: "https://www.meetup.com/kyoto-tech-meetup/events/example/",
    start: "2026-07-18T09:30:00+09:00",
    endTime: "2026-07-18T10:30:00+09:00",
    description: "",
    image: null,
    goingCount: 8,
    interestedCount: 14,
    eventType: "coffee",
    venue: { name: "Starbucks Karasuma Shijo" },
    ...overrides,
  };
}

describe("getHeroEventState", () => {
  test("formats a scheduled event for the English hero", () => {
    const state = getHeroEventState(makeEvent(), {
      fallbackUrl,
      lang: "en",
      now: fixedNow,
    });

    expect(state).toMatchObject({
      kind: "event",
      title: "Morning Tech & Coffee",
      dateLabel: "Sat, Jul 18, 2026",
      timeLabel: "9:30 AM–10:30 AM",
      venueName: "Starbucks Karasuma Shijo",
      isOngoing: false,
    });
  });

  test("formats Japanese details and treats a missing venue as deliberate", () => {
    const state = getHeroEventState(makeEvent({ venue: null }), {
      fallbackUrl,
      lang: "ja",
      now: fixedNow,
    });

    expect(state).toMatchObject({
      kind: "event",
      dateLabel: "2026年7月18日(土)",
      timeLabel: "9:30–10:30",
      venueName: null,
    });
  });

  test("marks an event in progress", () => {
    const state = getHeroEventState(
      makeEvent({
        start: "2026-07-10T11:00:00+09:00",
        endTime: "2026-07-10T13:00:00+09:00",
      }),
      { fallbackUrl, lang: "en", now: fixedNow },
    );

    expect(state).toMatchObject({ kind: "event", isOngoing: true });
  });

  test("returns the Meetup fallback when there is no upcoming event", () => {
    expect(
      getHeroEventState(null, { fallbackUrl, lang: "en", now: fixedNow }),
    ).toEqual({ kind: "empty", href: fallbackUrl });
  });
});
