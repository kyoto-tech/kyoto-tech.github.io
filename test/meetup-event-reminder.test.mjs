import { describe, it, expect } from "vitest";
import {
  buildReminderDiscordPayload,
  buildDigestDiscordPayload,
  computeIsoWeek,
  getJstWeekBounds,
  shouldSendReminder,
} from "../scripts/meetup-event-reminder.mjs";

// --- Helpers ---

function sampleEvent(overrides = {}) {
  return {
    title: "Morning Tech & Coffee",
    link: "https://www.meetup.com/kyoto-tech-meetup/events/123456789/",
    start: "2026-06-15T00:30:00.000Z", // Mon 15 Jun 2026 09:30 JST
    endTime: "2026-06-15T02:30:00.000Z",
    description: "A weekly coffee meetup",
    image: null,
    goingCount: 12,
    interestedCount: 5,
    eventType: "coffee",
    venue: { name: "FabCafe Kyoto", address: "123 Street", city: "Kyoto" },
    ...overrides,
  };
}

// --- buildReminderDiscordPayload tests ---

describe("buildReminderDiscordPayload", () => {
  it("coffee event type → content contains ☕ emoji", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ eventType: "coffee" }),
      "24h",
    );
    expect(payload.content).toContain("☕");
  });

  it("hack-day event type → content contains 💻 emoji", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ eventType: "hack-day", title: "Hack Day" }),
      "1h",
    );
    expect(payload.content).toContain("💻");
  });

  it("special event type → content contains ⭐ emoji", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ eventType: "special", title: "Special Event" }),
      "24h",
    );
    expect(payload.content).toContain("⭐");
  });

  it("with venue → description includes '📍 {venue.name}'", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ venue: { name: "FabCafe Kyoto" } }),
      "24h",
    );
    expect(payload.embeds[0].description).toContain("📍 FabCafe Kyoto");
  });

  it("without venue (null) → description does NOT have venue line", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ venue: null }),
      "24h",
    );
    expect(payload.embeds[0].description).not.toContain("📍");
    // Only going/interested line
    expect(payload.embeds[0].description).toContain("👥");
  });

  it("going/interested format: '👥 {N} going · {M} interested'", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ goingCount: 8, interestedCount: 3 }),
      "1h",
    );
    expect(payload.embeds[0].description).toContain(
      "👥 8 going · 3 interested",
    );
  });

  it("embed has correct title, url, timestamp, and footer", () => {
    const event = sampleEvent();
    const payload = buildReminderDiscordPayload(event, "24h");
    const embed = payload.embeds[0];

    expect(embed.title).toBe(event.title);
    expect(embed.url).toBe(event.link);
    expect(embed.timestamp).toBe(event.start);
    expect(embed.footer).toEqual({ text: "Kyoto Tech Meetup" });
  });

  it("embed includes the event image when Meetup provides one", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ image: "https://secure.meetupstatic.com/photos/event/1.jpg" }),
      "24h",
    );

    expect(payload.embeds[0].image).toEqual({
      url: "https://secure.meetupstatic.com/photos/event/1.jpg",
    });
  });

  it("embed omits invalid event image URLs", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ image: "javascript:alert(1)" }),
      "24h",
    );

    expect(payload.embeds[0]).not.toHaveProperty("image");
  });

  it("content uses generic timing copy", () => {
    const event = sampleEvent({ eventType: "coffee", title: "My Event" });
    const payload = buildReminderDiscordPayload(event, "24h");
    expect(payload.content).toBe("⏰ Upcoming event — **☕** My Event");
    expect(payload.content).not.toMatch(/tomorrow|1h|24h|hour/i);
  });

  it("defaults to 0 when goingCount/interestedCount are undefined", () => {
    const payload = buildReminderDiscordPayload(
      sampleEvent({ goingCount: undefined, interestedCount: undefined }),
      "24h",
    );
    expect(payload.embeds[0].description).toContain(
      "👥 0 going · 0 interested",
    );
  });
});

// --- computeIsoWeek tests ---

describe("computeIsoWeek", () => {
  it("a known Monday → correct ISO week (2026-01-05 → '2026-W02')", () => {
    // 2026-01-05 is a Monday, it's in ISO week 2
    const date = new Date("2026-01-05T03:00:00.000Z"); // 12:00 JST
    expect(computeIsoWeek(date, "Asia/Tokyo")).toBe("2026-W02");
  });

  it("week crossing year boundary (Dec 31, 2025 → '2026-W01')", () => {
    // Dec 31, 2025 is a Wednesday. ISO week 1 of 2026 starts Mon Dec 29, 2025
    // because Jan 1, 2026 is a Thursday (the first Thursday is in 2026)
    const date = new Date("2025-12-31T03:00:00.000Z"); // 12:00 JST
    expect(computeIsoWeek(date, "Asia/Tokyo")).toBe("2026-W01");
  });

  it("first day of year that's in previous year's last week (Jan 1, 2022 → '2021-W52')", () => {
    // Jan 1, 2022 is a Saturday. The Thursday of that week is Dec 30, 2021 → ISO year 2021
    const date = new Date("2022-01-01T03:00:00.000Z"); // 12:00 JST
    expect(computeIsoWeek(date, "Asia/Tokyo")).toBe("2021-W52");
  });

  it("zero-padded week numbers (early year)", () => {
    // 2026-01-12 is a Monday in week 3
    const date = new Date("2026-01-12T03:00:00.000Z"); // 12:00 JST
    const result = computeIsoWeek(date, "Asia/Tokyo");
    expect(result).toBe("2026-W03");
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("mid-year date (2026-06-15 → '2026-W25')", () => {
    // Jun 15, 2026 is a Monday — ISO week 25
    const date = new Date("2026-06-15T03:00:00.000Z"); // 12:00 JST
    expect(computeIsoWeek(date, "Asia/Tokyo")).toBe("2026-W25");
  });
});

// --- getJstWeekBounds tests ---

describe("getJstWeekBounds", () => {
  it("a Wednesday in JST → start is previous Monday 00:00 JST (= Sun 15:00 UTC)", () => {
    // Wed Jun 17, 2026 12:00 JST = Jun 17 03:00 UTC
    const date = new Date("2026-06-17T03:00:00.000Z");
    const { start, end } = getJstWeekBounds(date);

    // Monday Jun 15, 2026 00:00 JST = Jun 14 15:00 UTC
    expect(start.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    // Next Monday Jun 22, 2026 00:00 JST = Jun 21 15:00 UTC
    expect(end.toISOString()).toBe("2026-06-21T15:00:00.000Z");
  });

  it("a Monday 00:01 JST → start is that Monday 00:00 JST", () => {
    // Mon Jun 15, 2026 00:01 JST = Jun 14 15:01 UTC
    const date = new Date("2026-06-14T15:01:00.000Z");
    const { start } = getJstWeekBounds(date);

    // Monday Jun 15, 2026 00:00 JST = Jun 14 15:00 UTC
    expect(start.toISOString()).toBe("2026-06-14T15:00:00.000Z");
  });

  it("Sunday 23:59 JST → end is next Monday 00:00 JST (same week as start)", () => {
    // Sun Jun 21, 2026 23:59 JST = Jun 21 14:59 UTC
    const date = new Date("2026-06-21T14:59:00.000Z");
    const { start, end } = getJstWeekBounds(date);

    // Start: Monday Jun 15, 2026 00:00 JST = Jun 14 15:00 UTC
    expect(start.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    // End: Monday Jun 22, 2026 00:00 JST = Jun 21 15:00 UTC
    expect(end.toISOString()).toBe("2026-06-21T15:00:00.000Z");
  });

  it("start < end and span is exactly 7 days", () => {
    const date = new Date("2026-06-17T03:00:00.000Z");
    const { start, end } = getJstWeekBounds(date);

    expect(start.getTime()).toBeLessThan(end.getTime());
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(end.getTime() - start.getTime()).toBe(sevenDaysMs);
  });
});

// --- buildDigestDiscordPayload tests ---

describe("buildDigestDiscordPayload", () => {
  it("content is '📅 This week's Kyoto Tech events:'", () => {
    const payload = buildDigestDiscordPayload([sampleEvent()]);
    expect(payload.content).toBe("📅 This week's Kyoto Tech events:");
  });

  it("single event → bullet format '• [Title](url) — {weekday} {day} {month} {year} at {HH}:{MM} JST'", () => {
    const event = sampleEvent({
      title: "Coffee Chat",
      link: "https://www.meetup.com/kyoto-tech-meetup/events/111/",
      start: "2026-06-15T00:30:00.000Z", // Mon 15 Jun 2026 09:30 JST
    });
    const payload = buildDigestDiscordPayload([event]);
    const description = payload.embeds[0].description;

    expect(description).toContain("• [Coffee Chat](https://www.meetup.com/kyoto-tech-meetup/events/111/)");
    expect(description).toContain("Mon");
    expect(description).toContain("15");
    expect(description).toContain("Jun");
    expect(description).toContain("2026");
    expect(description).toContain("09:30 JST");
  });

  it("multiple events → multiple bullet lines joined by \\n", () => {
    const events = [
      sampleEvent({ title: "Event A", link: "https://meetup.com/a" }),
      sampleEvent({ title: "Event B", link: "https://meetup.com/b" }),
    ];
    const payload = buildDigestDiscordPayload(events);
    const lines = payload.embeds[0].description.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("• [Event A]");
    expect(lines[1]).toContain("• [Event B]");
  });

  it("event with venue → bullet ends with ' · 📍 {name}'", () => {
    const event = sampleEvent({ venue: { name: "FabCafe Kyoto" } });
    const payload = buildDigestDiscordPayload([event]);
    const description = payload.embeds[0].description;

    expect(description).toContain("· 📍 FabCafe Kyoto");
  });

  it("event without venue → no venue suffix", () => {
    const event = sampleEvent({ venue: null });
    const payload = buildDigestDiscordPayload([event]);
    const description = payload.embeds[0].description;

    expect(description).not.toContain("📍");
  });

  it("single-event digest includes the event image", () => {
    const payload = buildDigestDiscordPayload([
      sampleEvent({ image: "https://secure.meetupstatic.com/photos/event/1.jpg" }),
    ]);

    expect(payload.embeds[0].image).toEqual({
      url: "https://secure.meetupstatic.com/photos/event/1.jpg",
    });
  });

  it("multi-event digest uses the first valid event image", () => {
    const payload = buildDigestDiscordPayload([
      sampleEvent({ title: "Event A", image: "javascript:alert(1)" }),
      sampleEvent({ title: "Event B", image: "https://example.com/b.jpg" }),
    ]);

    expect(payload.embeds[0].image).toEqual({
      url: "https://example.com/b.jpg",
    });
  });
});

// --- Reminder send-window tests ---

describe("shouldSendReminder", () => {
  it("sends the 24h reminder after the early due time", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 29 * 60 * 60 * 1000;
    expect(shouldSendReminder(now, eventStart, "24h", {})).toBe(true);
  });

  it("does not send the 24h reminder before the early due time", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 31 * 60 * 60 * 1000;
    expect(shouldSendReminder(now, eventStart, "24h", {})).toBe(false);
  });

  it("does not send a stale 24h reminder inside 12 hours before the event", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 11 * 60 * 60 * 1000;
    expect(shouldSendReminder(now, eventStart, "24h", {})).toBe(false);
  });

  it("sends the day-of reminder after the early due time", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 5 * 60 * 60 * 1000;
    expect(shouldSendReminder(now, eventStart, "1h", {})).toBe(true);
  });

  it("does not send the day-of reminder before the early due time", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 7 * 60 * 60 * 1000;
    expect(shouldSendReminder(now, eventStart, "1h", {})).toBe(false);
  });

  it("allows the day-of reminder through event start", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime();
    expect(shouldSendReminder(now, eventStart, "1h", {})).toBe(true);
  });

  it("does not send a stale day-of reminder after event start", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() + 1;
    expect(shouldSendReminder(now, eventStart, "1h", {})).toBe(false);
  });

  it("does not send an already delivered reminder", () => {
    const eventStart = "2026-06-15T09:00:00.000Z";
    const now = new Date(eventStart).getTime() - 29 * 60 * 60 * 1000;
    expect(
      shouldSendReminder(now, eventStart, "24h", {
        deliveredAt: "2026-06-14T10:00:00.000Z",
      }),
    ).toBe(false);
  });
});
