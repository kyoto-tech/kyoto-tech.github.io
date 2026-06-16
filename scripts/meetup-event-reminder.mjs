import {
  defaultState,
  migrateStateItemIds,
  readStateFromGist,
  writeStateToGist,
} from "./lib/community-feed-notifier-state.mjs";
import { fetchWithTimeout } from "./lib/community-feed-reader.mjs";

const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT =
  "Kyoto Tech Meetup event reminder (+https://kyototechmeetup.com)";

const REMINDER_WINDOWS = ["24h", "1h"];
const WINDOW_OFFSETS = {
  "24h": 24 * 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
};

const EVENT_TYPE_EMOJI = {
  coffee: "☕",
  "hack-day": "💻",
  special: "⭐",
};

/**
 * Compute the ISO 8601 week identifier for a given date in a timezone.
 * Returns a string like "2026-W25".
 * @param {Date} date - The date to compute the week for
 * @param {string} timezone - IANA timezone (default: "Asia/Tokyo")
 * @returns {string} ISO week identifier in format "YYYY-Www"
 */
export function computeIsoWeek(date, timezone = "Asia/Tokyo") {
  // Get the date parts in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);

  // Create a date object representing the local date in the timezone
  // We use UTC methods to avoid local timezone interference
  const localDate = new Date(Date.UTC(year, month - 1, day));

  // ISO 8601: week starts Monday, W01 contains the year's first Thursday
  // Get day of week (Mon=1..Sun=7)
  const dayOfWeek = localDate.getUTCDay() === 0 ? 7 : localDate.getUTCDay();

  // Find the Thursday of the current week
  const thursday = new Date(localDate);
  thursday.setUTCDate(localDate.getUTCDate() + (4 - dayOfWeek));

  // ISO year is the year of the Thursday
  const isoYear = thursday.getUTCFullYear();

  // Week 1 of the year contains January 4th (or equivalently, the first Thursday)
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4DayOfWeek - 1));

  // Calculate week number
  const diffMs = thursday.getTime() - startOfWeek1.getTime();
  const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Get the Monday 00:00:00 JST and next Monday 00:00:00 JST (exclusive end) bounds
 * for the week containing the given date.
 * @param {Date} date - The date to compute bounds for
 * @returns {{ start: Date, end: Date }} UTC Date objects for the week boundaries in JST
 */
export function getJstWeekBounds(date) {
  const timezone = "Asia/Tokyo";

  // Get the date parts in JST
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);

  // Construct a UTC date that represents the JST calendar date
  const jstDate = new Date(Date.UTC(year, month - 1, day));

  // Get the day of week (Mon=1..Sun=7)
  const dayOfWeek = jstDate.getUTCDay() === 0 ? 7 : jstDate.getUTCDay();

  // Monday of the current week (00:00:00 JST)
  const monday = new Date(jstDate);
  monday.setUTCDate(jstDate.getUTCDate() - (dayOfWeek - 1));

  // Convert Monday 00:00:00 JST to UTC (JST is UTC+9)
  const startUtc = new Date(monday.getTime() - 9 * 60 * 60 * 1000);

  // Next Monday 00:00:00 JST (exclusive end)
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const endUtc = new Date(nextMonday.getTime() - 9 * 60 * 60 * 1000);

  return { start: startUtc, end: endUtc };
}

/**
 * Build a Discord payload for the weekly digest message.
 * @param {Array} events - Array of MeetupEvent objects within the week
 * @returns {object} Discord webhook payload
 */
export function buildDigestDiscordPayload(events) {
  const jstDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const bulletLines = events.map((event) => {
    const parts = jstDateFormatter.formatToParts(new Date(event.start));
    const weekday = parts.find((p) => p.type === "weekday").value;
    const dayNum = parts.find((p) => p.type === "day").value;
    const month = parts.find((p) => p.type === "month").value;
    const year = parts.find((p) => p.type === "year").value;
    const hour = parts.find((p) => p.type === "hour").value;
    const minute = parts.find((p) => p.type === "minute").value;

    const dateStr = `${weekday} ${dayNum} ${month} ${year} at ${hour}:${minute} JST`;
    let line = `• [${event.title}](${event.link}) — ${dateStr}`;

    if (event.venue && event.venue.name) {
      line += ` · 📍 ${event.venue.name}`;
    }

    return line;
  });

  return {
    content: "📅 This week's Kyoto Tech events:",
    embeds: [
      {
        description: bulletLines.join("\n"),
      },
    ],
  };
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    skipWithoutDestinations: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-without-destinations") {
      args.skipWithoutDestinations = true;
    }
  }

  return args;
}

const GIST_OPTIONS = {
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  userAgent: USER_AGENT,
};

/**
 * Build a Discord payload for a pre-event reminder.
 * @param {object} event - A MeetupEvent object
 * @param {string} window - The reminder window label ("24h" or "1h")
 * @returns {object} Discord webhook payload
 */
export function buildReminderDiscordPayload(event, window) {
  const emoji = EVENT_TYPE_EMOJI[event.eventType] || "⭐";

  const descriptionLines = [];
  if (event.venue && event.venue.name) {
    descriptionLines.push(`📍 ${event.venue.name}`);
  }
  descriptionLines.push(
    `👥 ${event.goingCount ?? 0} going · ${event.interestedCount ?? 0} interested`,
  );

  return {
    content: `⏰ Event reminder — **${emoji}** ${event.title}`,
    embeds: [
      {
        title: event.title,
        url: event.link,
        timestamp: event.start,
        description: descriptionLines.join("\n"),
        footer: { text: "Kyoto Tech Meetup" },
      },
    ],
  };
}

function upsertEventStateRecord(state, event) {
  if (!state.events[event.link]) {
    state.events[event.link] = {
      eventId: event.link,
      title: event.title,
      start: event.start,
      reminders: {
        "24h": {
          deliveredAt: null,
          deliveryId: null,
          lastAttemptAt: null,
          lastError: null,
        },
        "1h": {
          deliveredAt: null,
          deliveryId: null,
          lastAttemptAt: null,
          lastError: null,
        },
      },
    };
  }
  return state.events[event.link];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gistId = process.env.COMMUNITY_FEED_STATE_GIST_ID || "";
  const gistToken = process.env.GH_GIST_TOKEN || "";
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || "";

  // Destination check
  if (!discordWebhookUrl && args.skipWithoutDestinations) {
    console.log(
      "[reminder] No destinations configured; skipping reminder run.",
    );
    return;
  }

  if (!discordWebhookUrl && !args.dryRun) {
    console.error("[reminder] DISCORD_WEBHOOK_URL is not set.");
    process.exit(1);
  }

  // Gist ID check
  if (!gistId && !args.dryRun) {
    console.error("[reminder] COMMUNITY_FEED_STATE_GIST_ID is required.");
    process.exit(1);
  }

  // Fetch Meetup events
  let events;
  try {
    const { fetchMeetupEvents } = await import("../src/lib/meetup-events.ts");
    events = await fetchMeetupEvents();
  } catch (error) {
    console.warn(
      "[reminder] Failed to fetch Meetup events:",
      error?.message || String(error),
    );
    return;
  }

  if (!events || events.length === 0) {
    console.log("[reminder] No upcoming Meetup events found.");
    return;
  }

  // Read state from Gist
  const state = gistId
    ? await readStateFromGist(gistId, gistToken, GIST_OPTIONS)
    : defaultState();

  // Migrate state to v3 shape
  const now = new Date().toISOString();
  const migration = migrateStateItemIds(state, []);

  if (migration.changed) {
    state.initializedAt = state.initializedAt || now;
    state.updatedAt = now;

    if (args.dryRun) {
      console.log(
        `[reminder] [dry-run] Would write migrated state (v${state.version}).`,
      );
    } else if (gistId) {
      await writeStateToGist(gistId, gistToken, state, GIST_OPTIONS);
      console.log(`[reminder] Migrated state to v${state.version}.`);
    }
  }

  // Pre-event reminder logic (Task 5)
  const nowMs = Date.now();
  let deliveryFailures = [];

  for (const event of events) {
    const eventState = upsertEventStateRecord(state, event);

    for (const window of REMINDER_WINDOWS) {
      const offset = WINDOW_OFFSETS[window];
      const triggerTime = new Date(event.start).getTime() - offset;

      if (nowMs >= triggerTime && eventState.reminders[window].deliveredAt === null) {
        const payload = buildReminderDiscordPayload(event, window);

        if (args.dryRun) {
          console.log(
            `[reminder] [dry-run] Would send ${window} reminder for "${event.title}".`,
          );
          console.log(
            `[reminder] [dry-run] Payload: ${JSON.stringify(payload, null, 2)}`,
          );
          continue;
        }

        const attemptedAt = new Date().toISOString();

        try {
          const response = await fetchWithTimeout(
            `${discordWebhookUrl}?wait=true`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
            REQUEST_TIMEOUT_MS,
            USER_AGENT,
          );

          if (!response.ok) {
            const body = await response.text();
            throw new Error(
              `Discord webhook failed: HTTP ${response.status} ${body}`.trim(),
            );
          }

          const result = await response.json();
          eventState.reminders[window].deliveredAt = attemptedAt;
          eventState.reminders[window].deliveryId = result?.id
            ? String(result.id)
            : null;
          eventState.reminders[window].lastAttemptAt = attemptedAt;
          eventState.reminders[window].lastError = null;

          console.log(
            `[reminder] Sent ${window} reminder for "${event.title}".`,
          );
        } catch (error) {
          const message = error?.message || String(error);
          eventState.reminders[window].deliveredAt = null;
          eventState.reminders[window].deliveryId = null;
          eventState.reminders[window].lastAttemptAt = attemptedAt;
          eventState.reminders[window].lastError = message;

          deliveryFailures.push({
            event: event.title,
            window,
            error: message,
          });

          console.error(
            `[reminder] Failed to send ${window} reminder for "${event.title}": ${message}`,
          );
        }

        // Write state immediately after each attempt
        state.updatedAt = new Date().toISOString();
        if (gistId) {
          await writeStateToGist(gistId, gistToken, state, GIST_OPTIONS);
        }
      }
    }
  }

  // Weekly digest logic
  const jstDayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const jstParts = jstDayFormatter.formatToParts(new Date());
  const jstWeekday = jstParts.find((p) => p.type === "weekday").value;
  const jstHour = Number(jstParts.find((p) => p.type === "hour").value);

  const isMondayJst = jstWeekday === "Monday";
  const isPastEightJst = jstHour >= 8;

  if (isMondayJst && isPastEightJst) {
    const nowDate = new Date();
    const isoWeek = computeIsoWeek(nowDate);

    if (!state.weeklyDigest[isoWeek]?.deliveredAt) {
      const { start: weekStart, end: weekEnd } = getJstWeekBounds(nowDate);

      const weekEvents = events.filter((event) => {
        const eventTime = new Date(event.start).getTime();
        return eventTime >= weekStart.getTime() && eventTime < weekEnd.getTime();
      });

      if (weekEvents.length > 0) {
        const digestPayload = buildDigestDiscordPayload(weekEvents);

        if (args.dryRun) {
          console.log(
            `[reminder] [dry-run] Would send weekly digest for ${isoWeek} with ${weekEvents.length} event(s).`,
          );
          console.log(
            `[reminder] [dry-run] Payload: ${JSON.stringify(digestPayload, null, 2)}`,
          );
        } else {
          const attemptedAt = new Date().toISOString();

          try {
            const response = await fetchWithTimeout(
              `${discordWebhookUrl}?wait=true`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(digestPayload),
              },
              REQUEST_TIMEOUT_MS,
              USER_AGENT,
            );

            if (!response.ok) {
              const body = await response.text();
              throw new Error(
                `Discord webhook failed: HTTP ${response.status} ${body}`.trim(),
              );
            }

            const result = await response.json();
            state.weeklyDigest[isoWeek] = {
              deliveredAt: attemptedAt,
              deliveryId: result?.id ? String(result.id) : null,
              lastAttemptAt: attemptedAt,
              lastError: null,
            };

            console.log(
              `[reminder] Sent weekly digest for ${isoWeek} with ${weekEvents.length} event(s).`,
            );
          } catch (error) {
            const message = error?.message || String(error);
            state.weeklyDigest[isoWeek] = {
              deliveredAt: null,
              deliveryId: null,
              lastAttemptAt: attemptedAt,
              lastError: message,
            };

            deliveryFailures.push({
              event: `weekly-digest-${isoWeek}`,
              window: "digest",
              error: message,
            });

            console.error(
              `[reminder] Failed to send weekly digest for ${isoWeek}: ${message}`,
            );
          }

          // Write state immediately after digest attempt
          state.updatedAt = new Date().toISOString();
          if (gistId) {
            await writeStateToGist(gistId, gistToken, state, GIST_OPTIONS);
          }
        }
      } else {
        console.log(
          `[reminder] No events in ${isoWeek}; skipping weekly digest.`,
        );
      }
    } else {
      console.log(
        `[reminder] Weekly digest for ${isoWeek} already delivered; skipping.`,
      );
    }
  }

  console.log(`[reminder] Processed ${events.length} event(s).`);

  if (deliveryFailures.length > 0) {
    console.error(
      `[reminder] ${deliveryFailures.length} delivery failure(s): ${deliveryFailures
        .map((f) => `${f.window} -> ${f.event}`)
        .join("; ")}`,
    );
    process.exit(1);
  }
}

// Only run main() when executed directly (not when imported for testing)
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main().catch((error) => {
    console.error("[reminder] Unhandled error:", error);
    process.exit(1);
  });
}
