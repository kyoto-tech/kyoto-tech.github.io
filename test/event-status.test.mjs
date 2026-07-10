import { describe, expect, test } from "vitest";
import {
  IN_PROGRESS_GRACE_MS,
  isEventTimeOngoing,
  isOngoingEvent,
} from "../src/lib/event-status.ts";

describe("shared ongoing event state", () => {
  test("uses explicit start and end boundaries inclusively", () => {
    const start = "2026-07-10T10:00:00.000Z";
    const end = "2026-07-10T12:00:00.000Z";

    expect(isEventTimeOngoing(start, end, new Date(start))).toBe(true);
    expect(isEventTimeOngoing(start, end, new Date(end))).toBe(true);
    expect(
      isEventTimeOngoing(start, end, new Date("2026-07-10T12:00:00.001Z")),
    ).toBe(false);
  });

  test("uses the four-hour grace window when an end time is missing", () => {
    const start = "2026-07-10T10:00:00.000Z";
    const graceEnd = new Date(new Date(start).valueOf() + IN_PROGRESS_GRACE_MS);

    expect(isEventTimeOngoing(start, null, graceEnd)).toBe(true);
    expect(
      isEventTimeOngoing(start, null, new Date(graceEnd.valueOf() + 1)),
    ).toBe(false);
  });

  test("supports event-shaped values and rejects invalid timestamps", () => {
    expect(
      isOngoingEvent(
        {
          start: "2026-07-10T10:00:00.000Z",
          endTime: "2026-07-10T12:00:00.000Z",
        },
        new Date("2026-07-10T11:00:00.000Z"),
      ),
    ).toBe(true);
    expect(isEventTimeOngoing("invalid", null, new Date())).toBe(false);
  });
});
