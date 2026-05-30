import { expect, test } from "vitest";
import { classifyEventType } from "../src/lib/event-types.ts";

test("classifyEventType detects coffee events from the title", () => {
  expect(classifyEventType("Morning Tech & Coffee")).toBe("coffee");
  expect(classifyEventType("Kyoto Tech Coffee Session")).toBe("coffee");
});

test("classifyEventType detects hack day events from the title", () => {
  expect(classifyEventType("Kyoto Tech Meetup Hack Day")).toBe("hack-day");
  expect(classifyEventType("Community Hack Day #3")).toBe("hack-day");
});

test("classifyEventType treats every other title as special", () => {
  expect(classifyEventType("Guest Talk: Building with AI")).toBe("special");
  expect(classifyEventType("")).toBe("special");
});

test("classifyEventType checks coffee before hack day", () => {
  expect(classifyEventType("Coffee and Hack Day Planning")).toBe("coffee");
});
