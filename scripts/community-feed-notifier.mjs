import fs from "node:fs/promises";
import path from "node:path";
import Parser from "rss-parser";

const MEMBER_FEEDS_PATH = path.resolve("src/data/member-feeds.json");
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
const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

function parseArgs(argv) {
  const args = {
    allowInitialPosts: false,
    dryRun: false,
    maxDeliveries: null,
    maxItemsPerFeed: DEFAULT_MAX_ITEMS_PER_FEED,
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
    } else if (arg === "--suppress-remaining-after-limit") {
      args.suppressRemainingAfterLimit = true;
    }
  }

  return args;
}

function getStateFilename() {
  return process.env.COMMUNITY_FEED_STATE_GIST_FILENAME || DEFAULT_STATE_FILENAME;
}

async function loadMemberFeeds() {
  const content = await fs.readFile(MEMBER_FEEDS_PATH, "utf8");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${MEMBER_FEEDS_PATH}`);
  }

  return parsed.map((item) => {
    if (!item?.name || !item?.feedUrl || !item?.siteUrl) {
      throw new Error(
        `Missing required fields in member feed entry: ${JSON.stringify(item)}`,
      );
    }

    return {
      name: String(item.name),
      feedUrl: String(item.feedUrl),
      siteUrl: String(item.siteUrl),
    };
  });
}

function parseDate(rawItem) {
  const raw =
    rawItem.isoDate ||
    rawItem.pubDate ||
    rawItem.published ||
    rawItem.updated ||
    null;

  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function stripHtml(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 280) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;
}

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "user-agent": USER_AGENT,
      ...(options.headers || {}),
    },
  }).finally(() => {
    clearTimeout(timeout);
  });
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchText(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

function parseYoutubeChannelId(html) {
  if (!html) return null;

  const patterns = [
    /"externalId":"(UC[\w-]{22})"/,
    /"channelId":"(UC[\w-]{22})"/,
    /youtube\.com\/channel\/(UC[\w-]{22})/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] && YOUTUBE_CHANNEL_ID_PATTERN.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

async function resolveFeedUrl(feedUrl) {
  let parsed;

  try {
    parsed = new URL(feedUrl);
  } catch {
    return feedUrl;
  }

  if (!YOUTUBE_HOSTNAMES.has(parsed.hostname)) return feedUrl;

  const handleMatch = parsed.pathname.match(/^\/@([A-Za-z0-9._-]+)\/?$/);
  if (!handleMatch) return feedUrl;

  const channelPageHtml = await fetchText(feedUrl, {}, FEED_TIMEOUT_MS);
  const channelId = parseYoutubeChannelId(channelPageHtml);
  if (!channelId) {
    throw new Error(`Could not resolve YouTube channel id from handle URL: ${feedUrl}`);
  }

  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function normalizeItem(rawItem, source) {
  const publishedAt = parseDate(rawItem);
  if (!publishedAt) return null;

  const rawId =
    rawItem.guid ||
    rawItem.id ||
    rawItem.link ||
    `${rawItem.title || "untitled"}#${publishedAt.toISOString()}`;

  const summary =
    rawItem.contentSnippet ||
    stripHtml(rawItem["content:encoded"]) ||
    stripHtml(rawItem.content) ||
    stripHtml(rawItem.summary) ||
    stripHtml(rawItem.description) ||
    "";

  return {
    id: `${source.feedUrl}::${String(rawId)}`,
    sourceItemId: String(rawId),
    title: rawItem.title || "Untitled",
    link: rawItem.link || source.siteUrl,
    publishedAt: publishedAt.toISOString(),
    summary: truncate(summary),
    source,
  };
}

async function fetchFeedItems(source, parser, maxItemsPerFeed) {
  const resolvedFeedUrl = await resolveFeedUrl(source.feedUrl);
  const xml = await fetchText(resolvedFeedUrl, {}, FEED_TIMEOUT_MS);
  const parsed = await parser.parseString(xml);
  const rawItems = parsed?.items || [];
  const seenIds = new Set();

  return rawItems
    .map((rawItem) => normalizeItem(rawItem, source))
    .filter(Boolean)
    .filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.publishedAt).valueOf() - new Date(a.publishedAt).valueOf(),
    )
    .slice(0, Math.max(1, maxItemsPerFeed));
}

function defaultState() {
  return {
    version: 1,
    initializedAt: null,
    updatedAt: null,
    items: {},
  };
}

function parseState(content) {
  const parsed = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaultState();
  }

  return {
    version: Number(parsed.version) || 1,
    initializedAt:
      typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    items:
      parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
        ? parsed.items
        : {},
  };
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
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update gist state: HTTP ${response.status} ${body}`.trim(),
    );
  }
}

function upsertStateRecord(state, item, seenAt, options = {}) {
  const existing = state.items[item.id];
  const record = {
    id: item.id,
    sourceItemId: item.sourceItemId,
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
    summary: item.summary || null,
    source: item.source,
    firstSeenAt: existing?.firstSeenAt || seenAt,
    lastSeenAt: seenAt,
    suppressed:
      typeof existing?.suppressed === "boolean"
        ? existing.suppressed
        : Boolean(options.suppressed),
    channels:
      existing?.channels && typeof existing.channels === "object"
        ? existing.channels
        : {},
  };

  state.items[item.id] = record;
  return record;
}

function buildMessage(item) {
  return [`New community post from ${item.source.name}`, item.title, item.link].join(
    "\n",
  );
}

function buildDiscordPayload(item) {
  return {
    content: `New community post from **${item.source.name}**`,
    embeds: [
      {
        title: item.title,
        url: item.link,
        description: item.summary || undefined,
        timestamp: item.publishedAt,
        author: {
          name: item.source.name,
          url: item.source.siteUrl,
        },
        footer: {
          text: item.source.siteUrl,
        },
      },
    ],
  };
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
  const webhookSecret = process.env.COMMUNITY_FEED_GENERIC_WEBHOOK_SECRET;
  const headers = { "Content-Type": "application/json" };
  if (webhookSecret) {
    headers["x-webhook-secret"] = webhookSecret;
  }
  const response = await fetchWithTimeout(
    webhookUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "community_feed_item",
        item,
        message: buildMessage(item),
      }),
    },
    REQUEST_TIMEOUT_MS,
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

  if (!destinations.length && !args.dryRun) {
    throw new Error(
      "No destinations configured. Set DISCORD_WEBHOOK_URL and/or COMMUNITY_FEED_GENERIC_WEBHOOK_URL.",
    );
  }

  if (!gistId && !args.dryRun) {
    throw new Error("COMMUNITY_FEED_STATE_GIST_ID is required.");
  }

  const memberFeeds = await loadMemberFeeds();
  const parser = new Parser();
  const fetchFailures = [];
  const allItems = [];

  for (const source of memberFeeds) {
    try {
      const items = await fetchFeedItems(source, parser, args.maxItemsPerFeed);
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
