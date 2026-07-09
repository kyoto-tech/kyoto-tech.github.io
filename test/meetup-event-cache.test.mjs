import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  isValidMeetupEventCache,
  parseArgs,
  readMeetupEventCache,
  refreshMeetupEventCache,
} from "../scripts/fetch-meetup-events.mjs";

const fixedNow = new Date("2026-07-10T03:00:00.000Z");

function makeMeetupEvent(overrides = {}) {
  return {
    title: "Morning Tech & Coffee",
    link: "https://www.meetup.com/kyoto-tech-meetup/events/example/",
    start: "2026-07-18T01:00:00.000Z",
    endTime: "2026-07-18T03:00:00.000Z",
    description: "",
    image: null,
    goingCount: 10,
    interestedCount: 12,
    eventType: "coffee",
    venue: null,
    ...overrides,
  };
}

describe("Meetup event cache", () => {
  let temporaryDirectory;
  let outputPath;
  let logger;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "kyoto-tech-meetup-events-"),
    );
    outputPath = path.join(temporaryDirectory, "meetup-events.json");
    logger = { info: vi.fn(), warn: vi.fn() };
  });

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { force: true, recursive: true });
  });

  test("writes a successful refresh atomically", async () => {
    const events = [makeMeetupEvent()];
    const fetchEventsFn = vi.fn(async () => events);

    const result = await refreshMeetupEventCache({
      eventsUrl: "https://example.com/events",
      fetchEventsFn,
      logger,
      now: fixedNow,
      outputPath,
      timeoutMs: 4321,
    });

    expect(result.status).toBe("updated");
    expect(fetchEventsFn).toHaveBeenCalledWith({
      eventsUrl: "https://example.com/events",
      now: fixedNow,
      timeoutMs: 4321,
    });
    await expect(readMeetupEventCache(outputPath)).resolves.toEqual({
      generatedAt: fixedNow.toISOString(),
      events,
    });
    expect(logger.info).toHaveBeenCalledOnce();
  });

  test("preserves an existing valid cache after a stale-ok failure", async () => {
    const existing = {
      generatedAt: "2026-07-09T03:00:00.000Z",
      events: [makeMeetupEvent()],
    };
    await fs.writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
    const before = await fs.readFile(outputPath, "utf8");

    const result = await refreshMeetupEventCache({
      fetchEventsFn: async () => {
        throw new Error("Meetup unavailable");
      },
      logger,
      now: fixedNow,
      outputPath,
      staleOk: true,
    });

    expect(result).toEqual({ payload: existing, status: "fallback" });
    expect(await fs.readFile(outputPath, "utf8")).toBe(before);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  test("accepts a valid empty cache as the stale fallback", async () => {
    const existing = {
      generatedAt: "2026-07-09T03:00:00.000Z",
      events: [],
    };
    await fs.writeFile(outputPath, JSON.stringify(existing));

    const result = await refreshMeetupEventCache({
      fetchEventsFn: async () => {
        throw new Error("Meetup unavailable");
      },
      logger,
      outputPath,
      staleOk: true,
    });

    expect(result).toEqual({ payload: existing, status: "fallback" });
  });

  test("strict mode fails instead of writing fallback data", async () => {
    await expect(
      refreshMeetupEventCache({
        fetchEventsFn: async () => {
          throw new Error("Meetup unavailable");
        },
        logger,
        outputPath,
      }),
    ).rejects.toThrow("Meetup unavailable");

    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("stale-ok mode fails when no valid cache exists", async () => {
    await fs.writeFile(outputPath, JSON.stringify({ events: "invalid" }));

    await expect(
      refreshMeetupEventCache({
        fetchEventsFn: async () => {
          throw new Error("Meetup unavailable");
        },
        logger,
        outputPath,
        staleOk: true,
      }),
    ).rejects.toThrow("no valid cache exists");
  });
});

test("cache validation and CLI parsing reject invalid inputs", () => {
  expect(
    isValidMeetupEventCache({
      generatedAt: fixedNow.toISOString(),
      events: [makeMeetupEvent()],
    }),
  ).toBe(true);
  expect(isValidMeetupEventCache({ generatedAt: "invalid", events: [] })).toBe(
    false,
  );
  expect(() => parseArgs(["--timeout", "0"])).toThrow("positive number");
  expect(parseArgs(["--stale-ok", "--timeout", "5000"])).toMatchObject({
    staleOk: true,
    timeoutMs: 5000,
  });
});
