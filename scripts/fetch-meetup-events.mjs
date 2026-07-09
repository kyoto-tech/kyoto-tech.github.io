import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MEETUP_EVENTS_URL,
  DEFAULT_MEETUP_TIMEOUT_MS,
  fetchMeetupEvents,
  isMeetupEvent,
} from "../src/lib/meetup-events.ts";

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.env.MEETUP_EVENTS_OUTPUT || "src/data/meetup-events.json",
);
const DEFAULT_EVENTS_URL =
  process.env.MEETUP_EVENTS_URL || DEFAULT_MEETUP_EVENTS_URL;
const DEFAULT_TIMEOUT_MS = Number(
  process.env.MEETUP_EVENTS_TIMEOUT_MS || DEFAULT_MEETUP_TIMEOUT_MS,
);

export function parseArgs(argv) {
  const args = {
    eventsUrl: DEFAULT_EVENTS_URL,
    outputPath: DEFAULT_OUTPUT_PATH,
    staleOk: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stale-ok") {
      args.staleOk = true;
    } else if (arg === "--output" && argv[index + 1]) {
      args.outputPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--url" && argv[index + 1]) {
      args.eventsUrl = argv[index + 1];
      index += 1;
    } else if (arg === "--timeout" && argv[index + 1]) {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("Meetup event timeout must be a positive number.");
  }

  return args;
}

export function isValidMeetupEventCache(value) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.events)) return false;
  if (
    typeof value.generatedAt !== "string" ||
    Number.isNaN(new Date(value.generatedAt).valueOf())
  ) {
    return false;
  }

  return value.events.every(isMeetupEvent);
}

export async function readMeetupEventCache(outputPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8"));
    return isValidMeetupEventCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMeetupEventCache(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.rename(temporaryPath, outputPath);
}

export async function refreshMeetupEventCache({
  eventsUrl = DEFAULT_EVENTS_URL,
  fetchEventsFn = fetchMeetupEvents,
  logger = console,
  now = new Date(),
  outputPath = DEFAULT_OUTPUT_PATH,
  staleOk = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  try {
    const events = await fetchEventsFn({ eventsUrl, now, timeoutMs });
    const payload = {
      generatedAt: now.toISOString(),
      events,
    };

    await writeMeetupEventCache(outputPath, payload);
    logger.info(
      `[events] Wrote ${events.length} event(s) to ${path.relative(process.cwd(), outputPath)}.`,
    );
    return { payload, status: "updated" };
  } catch (error) {
    if (!staleOk) throw error;

    const existing = await readMeetupEventCache(outputPath);
    if (!existing) {
      throw new Error(
        `Meetup event refresh failed and no valid cache exists at ${outputPath}: ${error?.message || String(error)}`,
        { cause: error },
      );
    }

    logger.warn(
      `[events] Using existing data from ${outputPath} because refresh failed: ${error?.message || String(error)}`,
    );
    return { payload: existing, status: "fallback" };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await refreshMeetupEventCache(args);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[events] Unhandled error:", error?.message || String(error));
    process.exit(1);
  });
}
