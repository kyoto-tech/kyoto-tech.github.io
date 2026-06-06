import { expect, test } from "vitest";
import { normalizeMeetupEventTitle } from "../src/lib/meetup-events.ts";

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
