import { expect, test } from "vitest";
import {
  getFiveWeekCalendarRange,
  toFullCalendarEvents,
} from "../src/lib/full-calendar-events.ts";

test("getFiveWeekCalendarRange starts on the current week and spans five weeks", () => {
  const range = getFiveWeekCalendarRange(new Date("2026-05-30T06:00:00.000Z"));

  expect(range).toEqual({
    start: "2026-05-25",
    end: "2026-06-29",
  });
});

test("toFullCalendarEvents keeps event type in extended props", () => {
  const events = toFullCalendarEvents([
    {
      title: "Morning Tech & Coffee",
      link: "https://example.com/coffee",
      start: "2026-06-01T00:30:00.000Z",
      endTime: "2026-06-01T02:00:00.000Z",
      eventType: "coffee",
    },
  ]);

  expect(events).toEqual([
    {
      title: "Morning Tech & Coffee",
      url: "https://example.com/coffee",
      start: "2026-06-01T00:30:00.000Z",
      end: "2026-06-01T02:00:00.000Z",
      extendedProps: {
        eventType: "coffee",
      },
      className: ["event-type-coffee"],
    },
  ]);
});
