import {
  fetchFeedItems,
  fetchJson,
  fetchWithTimeout,
  loadMemberFeeds,
} from "./lib/community-feed-reader.mjs";
import {
  buildDiscordPayload,
  buildMessage,
  defaultState,
  parseState,
  upsertStateRecord,
} from "./lib/community-feed-notifier-state.mjs";

const GITHUB_API_ROOT = "https://api.github.com";
const DEFAULT_STATE_FILENAME = "community-feed-state.json";
const DEFAULT_MAX_ITEMS_PER_FEED = Number(
  process.env.COMMUNITY_FEED_MAX_ITEMS_PER_FEED || 10,
);
const FEED_TIMEOUT_MS = Number(process.env.COMMUNITY_FEED_TIMEOUT_MS || 12000);
const REQUEST_TIMEOUT_MS = Number(
  process.env.COMMUNITY_FEED_REQUEST_TIMEOUT_MS || 10000,
);
const USER_AGENT =
  "Kyoto Tech Meetup community notifier (+https://kyototechmeetup.com)";

function parseArgs(argv) {
  const args = {
    allowInitialPosts: false,
    dryRun: false,
    maxDeliveries: null,
    maxItemsPerFeed: DEFAULT_MAX_ITEMS_PER_FEED,
    skipWithoutDestinations: false,
    suppressRemainingAfterLimit: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--allow-initial-posts") {
      args.allowInitialPosts = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--max-deliveries" && argv[i + 1]) {
      args.maxDeliveries = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--max-items-per-feed" && argv[i + 1]) {
      args.maxItemsPerFeed = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--skip-without-destinations") {
      args.skipWithoutDestinations = true;
    } else if (arg === "--suppress-remaining-after-limit") {
      args.suppressRemainingAfterLimit = true;
    }
  }

  return args;
}

function getStateFilename() {
  return process.env.COMMUNITY_FEED_STATE_GIST_FILENAME || DEFAULT_STATE_FILENAME;
}

async function readStateFromGist(gistId, token) {
  const headers = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const gist = await fetchJson(
    `${GITHUB_API_ROOT}/gists/${gistId}`,
    { headers },
    REQUEST_TIMEOUT_MS,
    USER_AGENT,
  );
  const stateFile = gist?.files?.[getStateFilename()];

  if (!stateFile?.content) {
    return defaultState();
  }

  return parseState(stateFile.content);
}

async function writeStateToGist(gistId, token, state) {
  if (!token) {
    throw new Error("GH_GIST_TOKEN is required to update gist-backed state.");
  }

  const payload = {
    files: {
      [getStateFilename()]: {
        content: `${JSON.stringify(state, null, 2)}\n`,
      },
    },
  };

  const response = await fetchWithTimeout(
    `${GITHUB_API_ROOT}/gists/${gistId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS,
    USER_AGENT,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update gist state: HTTP ${response.status} ${body}`.trim(),
    );
  }
}

async function sendDiscordNotification(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const response = await fetchWithTimeout(
    `${webhookUrl}?wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildDiscordPayload(item)),
    },
    REQUEST_TIMEOUT_MS,
    USER_AGENT,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed: HTTP ${response.status} ${body}`.trim());
  }

  const payload = await response.json();
  return {
    deliveryId: payload?.id ? String(payload.id) : null,
  };
}

async function sendGenericWebhookNotification(item) {
  const webhookUrl = process.env.COMMUNITY_FEED_GENERIC_WEBHOOK_URL;
  const response = await fetchWithTimeout(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "community_feed_item",
        item,
        message: buildMessage(item),
      }),
    },
    REQUEST_TIMEOUT_MS,
    USER_AGENT,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Generic webhook failed: HTTP ${response.status} ${body}`.trim(),
    );
  }

  return {
    deliveryId: null,
  };
}

function getDestinations() {
  const destinations = [];

  if (process.env.DISCORD_WEBHOOK_URL) {
    destinations.push({
      name: "discord",
      send: sendDiscordNotification,
    });
  }

  if (process.env.COMMUNITY_FEED_GENERIC_WEBHOOK_URL) {
    destinations.push({
      name: "genericWebhook",
      send: sendGenericWebhookNotification,
    });
  }

  return destinations;
}

function hasPendingDestinations(record, destinations) {
  return destinations.some((destination) => {
    const delivery = record.channels?.[destination.name];
    return !delivery?.deliveredAt;
  });
}

async function deliverItem(item, record, destinations, dryRun) {
  let newDeliveries = 0;
  const failures = [];

  for (const destination of destinations) {
    const existingDelivery = record.channels?.[destination.name];
    if (existingDelivery?.deliveredAt) continue;

    const attemptedAt = new Date().toISOString();

    if (dryRun) {
      console.log(
        `[notifier] [dry-run] Would send "${item.title}" to ${destination.name}.`,
      );
      continue;
    }

    try {
      const result = await destination.send(item);
      record.channels[destination.name] = {
        deliveredAt: attemptedAt,
        deliveryId: result?.deliveryId || null,
        lastAttemptAt: attemptedAt,
        lastError: null,
      };
      newDeliveries += 1;
    } catch (error) {
      const message = error?.message || String(error);
      record.channels[destination.name] = {
        deliveredAt: null,
        deliveryId: null,
        lastAttemptAt: attemptedAt,
        lastError: message,
      };
      failures.push({
        destination: destination.name,
        error: message,
        itemId: item.id,
        title: item.title,
      });
    }
  }

  return {
    failures,
    newDeliveries,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gistId = process.env.COMMUNITY_FEED_STATE_GIST_ID || "";
  const gistToken = process.env.GH_GIST_TOKEN || "";
  const destinations = getDestinations();

  if (!destinations.length && !args.dryRun && args.skipWithoutDestinations) {
    console.log(
      "[notifier] No destinations configured; skipping notification run.",
    );
    return;
  }

  if (!destinations.length && !args.dryRun) {
    throw new Error(
      "No destinations configured. Set DISCORD_WEBHOOK_URL and/or COMMUNITY_FEED_GENERIC_WEBHOOK_URL.",
    );
  }

  if (!gistId && !args.dryRun) {
    throw new Error("COMMUNITY_FEED_STATE_GIST_ID is required.");
  }

  const memberFeeds = await loadMemberFeeds();
  const fetchFailures = [];
  const allItems = [];

  for (const source of memberFeeds) {
    try {
      const items = await fetchFeedItems(source, {
        feedTimeoutMs: FEED_TIMEOUT_MS,
        maxItemsPerFeed: args.maxItemsPerFeed,
        userAgent: USER_AGENT,
      });
      allItems.push(...items);
    } catch (error) {
      fetchFailures.push({
        source: source.name,
        error: error?.message || String(error),
      });
    }
  }

  if (!allItems.length && fetchFailures.length) {
    throw new Error(
      `Failed to fetch all feeds: ${fetchFailures
        .map((failure) => `${failure.source}: ${failure.error}`)
        .join("; ")}`,
    );
  }

  if (!allItems.length) {
    console.log("[notifier] No items available from configured feeds.");
    return;
  }

  const state = gistId ? await readStateFromGist(gistId, gistToken) : defaultState();
  const now = new Date().toISOString();
  const sortedItems = allItems.sort(
    (a, b) => new Date(a.publishedAt).valueOf() - new Date(b.publishedAt).valueOf(),
  );
  const isFirstRun = Object.keys(state.items).length === 0;

  if (isFirstRun && !args.allowInitialPosts) {
    for (const item of sortedItems) {
      upsertStateRecord(state, item, now, { suppressed: true });
    }

    state.initializedAt = state.initializedAt || now;
    state.updatedAt = now;

    if (args.dryRun) {
      console.log(
        `[notifier] [dry-run] Would seed ${sortedItems.length} item(s) without posting.`,
      );
      return;
    }

    await writeStateToGist(gistId, gistToken, state);
    console.log(
      `[notifier] Seeded ${sortedItems.length} existing item(s) into gist without posting.`,
    );
    return;
  }

  let newDeliveries = 0;
  const deliveryFailures = [];
  let limitedItems = 0;
  let processedItems = 0;
  let stateChanged = false;

  for (const item of sortedItems) {
    const record = upsertStateRecord(state, item, now);

    if (record.suppressed) continue;
    if (!hasPendingDestinations(record, destinations)) continue;

    if (args.maxDeliveries !== null && processedItems >= args.maxDeliveries) {
      limitedItems += 1;

      if (args.suppressRemainingAfterLimit) {
        record.suppressed = true;
        state.initializedAt = state.initializedAt || now;
        state.updatedAt = new Date().toISOString();
        stateChanged = true;

        if (!args.dryRun) {
          await writeStateToGist(gistId, gistToken, state);
        }
      }

      continue;
    }

    processedItems += 1;
    const result = await deliverItem(item, record, destinations, args.dryRun);
    newDeliveries += result.newDeliveries;
    deliveryFailures.push(...result.failures);
    state.initializedAt = state.initializedAt || now;
    state.updatedAt = new Date().toISOString();
    stateChanged = true;

    if (!args.dryRun) {
      await writeStateToGist(gistId, gistToken, state);
    }
  }

  if (fetchFailures.length) {
    fetchFailures.forEach((failure) => {
      console.warn(`[notifier] Feed fetch failed for ${failure.source}: ${failure.error}`);
    });
  }

  if (!stateChanged) {
    console.log("[notifier] No new community posts needed delivery.");
  } else {
    console.log(`[notifier] Sent ${newDeliveries} new delivery(s).`);
  }

  if (limitedItems) {
    const messagePrefix = args.suppressRemainingAfterLimit
      ? args.dryRun
        ? "Would suppress"
        : "Suppressed"
      : "Left pending";
    console.log(
      `[notifier] ${messagePrefix} ${limitedItems} additional item(s) after reaching the ${args.maxDeliveries}-item limit.`,
    );
  }

  if (deliveryFailures.length) {
    throw new Error(
      `Notifier delivery failures: ${deliveryFailures
        .map((failure) => `${failure.destination} -> ${failure.title}`)
        .join("; ")}`,
    );
  }
}

main().catch((error) => {
  console.error("[notifier] Unhandled error:", error);
  process.exit(1);
});
