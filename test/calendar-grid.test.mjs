import { expect, test } from "vitest";
import {
  buildFiveWeekCalendar,
  getFiveWeekCalendarRange,
} from "../src/lib/calendar-grid.ts";

function makeEvent(overrides = {}) {
  return {
    title: "Morning Tech & Coffee",
    link: "https://example.com/coffee",
    start: "2026-06-04T08:30:00+09:00",
    endTime: "2026-06-04T09:30:00+09:00",
    description: "",
    image: null,
    goingCount: 0,
    interestedCount: 0,
    eventType: "coffee",
    venue: null,
    ...overrides,
  };
}

test("getFiveWeekCalendarRange starts on Monday and spans five weeks", () => {
  const range = getFiveWeekCalendarRange(new Date("2026-05-30T06:00:00.000Z"));

  expect(range).toEqual({
    start: "2026-05-25",
    end: "2026-06-29",
  });
});

test("buildFiveWeekCalendar creates five complete weeks", () => {
  const weeks = buildFiveWeekCalendar([], {
    currentDate: new Date("2026-05-30T06:00:00.000Z"),
  });

  expect(weeks).toHaveLength(5);
  expect(weeks.every((week) => week.length === 7)).toBe(true);
  expect(weeks[0][0].dateKey).toBe("2026-05-25");
  expect(weeks[4][6].dateKey).toBe("2026-06-28");
});

test("buildFiveWeekCalendar places early-morning JST events on the local date", () => {
  const event = makeEvent();
  const weeks = buildFiveWeekCalendar([event], {
    currentDate: new Date("2026-05-30T06:00:00.000Z"),
  });
  const eventDay = weeks.flat().find((day) => day.dateKey === "2026-06-04");

  expect(eventDay?.events).toEqual([event]);
});

test("buildFiveWeekCalendar sorts multiple events deterministically", () => {
  const later = makeEvent({
    title: "Later",
    link: "https://example.com/later",
    start: "2026-06-04T12:00:00+09:00",
  });
  const earlier = makeEvent({
    title: "Earlier",
    link: "https://example.com/earlier",
    start: "2026-06-04T08:00:00+09:00",
  });
  const weeks = buildFiveWeekCalendar([later, earlier], {
    currentDate: new Date("2026-05-30T06:00:00.000Z"),
  });
  const eventDay = weeks.flat().find((day) => day.dateKey === "2026-06-04");

  expect(eventDay?.events.map((event) => event.title)).toEqual([
    "Earlier",
    "Later",
  ]);
});
