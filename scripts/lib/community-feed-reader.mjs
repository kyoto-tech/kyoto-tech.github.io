import fs from "node:fs/promises";
import path from "node:path";
import Parser from "rss-parser";

const DEFAULT_MEMBER_FEEDS_PATH = path.resolve("src/data/member-feeds.json");
const DEFAULT_FEED_TIMEOUT_MS = 12000;
const DEFAULT_USER_AGENT =
  "Kyoto Tech Meetup feed reader (+https://kyototechmeetup.com)";

const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

export async function loadMemberFeeds(filePath = DEFAULT_MEMBER_FEEDS_PATH) {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${filePath}`);
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

export function parseDate(rawItem) {
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

export function stripHtml(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(value, max = 280) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;
}

export function isYoutubeUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return YOUTUBE_HOSTNAMES.has(parsed.hostname) || parsed.hostname === "youtu.be";
  } catch {
    return false;
  }
}

export function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DEFAULT_FEED_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      ...(userAgent ? { "user-agent": userAgent } : {}),
      ...(options.headers || {}),
    },
  }).finally(() => {
    clearTimeout(timeout);
  });
}

export async function fetchText(
  url,
  options = {},
  timeoutMs = DEFAULT_FEED_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
) {
  const response = await fetchWithTimeout(url, options, timeoutMs, userAgent);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

export async function fetchJson(
  url,
  options = {},
  timeoutMs = DEFAULT_FEED_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
) {
  const response = await fetchWithTimeout(url, options, timeoutMs, userAgent);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

export function parseYoutubeChannelId(html) {
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

export async function resolveFeedUrl(
  feedUrl,
  {
    fetchTextFn = fetchText,
    feedTimeoutMs = DEFAULT_FEED_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
  } = {},
) {
  let parsed;

  try {
    parsed = new URL(feedUrl);
  } catch {
    return feedUrl;
  }

  if (!YOUTUBE_HOSTNAMES.has(parsed.hostname)) return feedUrl;

  const handleMatch = parsed.pathname.match(/^\/@([A-Za-z0-9._-]+)\/?$/);
  if (!handleMatch) return feedUrl;

  const channelPageHtml = await fetchTextFn(feedUrl, {}, feedTimeoutMs, userAgent);
  const channelId = parseYoutubeChannelId(channelPageHtml);
  if (!channelId) {
    throw new Error(`Could not resolve YouTube channel id from handle URL: ${feedUrl}`);
  }

  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function normalizeNotifierItem(rawItem, source) {
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

export function normalizeAndLimitFeedItems(
  rawItems,
  source,
  {
    maxItemsPerFeed = 10,
    normalizeItem = normalizeNotifierItem,
  } = {},
) {
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

export async function fetchRawFeedItems(
  source,
  {
    parser = new Parser(),
    fetchTextFn = fetchText,
    feedTimeoutMs = DEFAULT_FEED_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
  } = {},
) {
  const resolvedFeedUrl = await resolveFeedUrl(source.feedUrl, {
    fetchTextFn,
    feedTimeoutMs,
    userAgent,
  });
  const xml = await fetchTextFn(resolvedFeedUrl, {}, feedTimeoutMs, userAgent);
  const parsed = await parser.parseString(xml);
  return parsed?.items || [];
}

export async function fetchFeedItems(
  source,
  {
    parser = new Parser(),
    fetchTextFn = fetchText,
    feedTimeoutMs = DEFAULT_FEED_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
    maxItemsPerFeed = 10,
    normalizeItem = normalizeNotifierItem,
  } = {},
) {
  const rawItems = await fetchRawFeedItems(source, {
    parser,
    fetchTextFn,
    feedTimeoutMs,
    userAgent,
  });

  return normalizeAndLimitFeedItems(rawItems, source, {
    maxItemsPerFeed,
    normalizeItem,
  });
}
