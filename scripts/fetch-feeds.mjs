import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Parser from "rss-parser";

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.env.COMPOSITE_FEED_OUTPUT || "src/data/composite-feed.json",
);
const DEFAULT_ITEMS_PER_FEED = Number(
  process.env.COMPOSITE_FEED_ITEMS_PER_FEED || 3,
);
const FEED_TIMEOUT_MS = Number(process.env.COMPOSITE_FEED_TIMEOUT_MS || 12000);
const USER_AGENT =
  "Kyoto Tech Meetup feed aggregator (+https://kyoto-tech.github.io)";
const MEMBER_FEEDS_PATH = path.resolve("src/data/member-feeds.json");

function parseArgs(argv) {
  const args = {
    staleOk: false,
    outputPath: DEFAULT_OUTPUT_PATH,
    itemsPerFeed: DEFAULT_ITEMS_PER_FEED,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--stale-ok") {
      args.staleOk = true;
    } else if (arg === "--output" && argv[i + 1]) {
      args.outputPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--items-per-feed" && argv[i + 1]) {
      args.itemsPerFeed = Number(argv[i + 1]);
      i += 1;
    }
  }

  return args;
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

function truncate(value, max = 320) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;
}

function resolveImage(rawItem) {
  const enclosureUrl =
    typeof rawItem.enclosure?.url === "string" ? rawItem.enclosure.url : null;
  if (enclosureUrl?.startsWith("http")) return enclosureUrl;

  const content = rawItem["content:encoded"] || rawItem.content || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]?.startsWith("http")) {
    return imgMatch[1];
  }

  return null;
}

function normalizeItem(rawItem, source) {
  const publishedAt = parseDate(rawItem);
  if (!publishedAt) return null;

  const summary =
    rawItem.contentSnippet ||
    stripHtml(rawItem["content:encoded"]) ||
    stripHtml(rawItem.content) ||
    "";

  const key =
    rawItem.guid ||
    rawItem.id ||
    rawItem.link ||
    `${source.siteUrl}#${rawItem.title || "untitled"}#${publishedAt.toISOString()}`;

  return {
    id: key,
    title: rawItem.title || "Untitled",
    link: rawItem.link || source.siteUrl,
    publishedAt: publishedAt.toISOString(),
    source: {
      name: source.name,
      siteUrl: source.siteUrl,
      feedUrl: source.feedUrl,
    },
    summary: truncate(summary, 360),
    image: resolveImage(rawItem),
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFeed(source, parser) {
  const xml = await fetchWithTimeout(source.feedUrl, FEED_TIMEOUT_MS);
  const parsed = await parser.parseString(xml);
  return parsed?.items || [];
}

async function writeOutput(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readExisting(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.warn(`[feeds] Unable to read existing file ${filePath}:`, error);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const memberFeeds = await loadMemberFeeds();
  const parser = new Parser();
  const now = new Date();
  const failures = [];
  const feedsWithItems = [];

  for (const source of memberFeeds) {
    try {
      const rawItems = await fetchFeed(source, parser);
      const seenIds = new Set();
      const normalizedItems = rawItems
        .map((rawItem) => normalizeItem(rawItem, source))
        .filter(Boolean)
        .filter((item) => {
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        })
        .sort(
          (a, b) =>
            new Date(b.publishedAt).valueOf() -
            new Date(a.publishedAt).valueOf(),
        )
        .slice(0, Math.max(1, args.itemsPerFeed));

      feedsWithItems.push({
        ...source,
        items: normalizedItems,
      });
    } catch (error) {
      failures.push({ source: source.name, error: error?.message || String(error) });
      feedsWithItems.push({
        ...source,
        items: [],
        error: error?.message || String(error),
      });
    }
  }

  const totalItems = feedsWithItems.reduce(
    (sum, feed) => sum + (feed.items?.length || 0),
    0,
  );

  const payload = {
    generatedAt: now.toISOString(),
    itemsPerFeed: args.itemsPerFeed,
    feeds: feedsWithItems,
    failedSources: failures,
  };

  if (totalItems === 0 && args.staleOk) {
    const existing = await readExisting(args.outputPath);
    if (existing?.feeds?.length) {
      console.warn(
        `[feeds] Using existing data from ${args.outputPath} because fetching produced no items.`,
      );
      await writeOutput(args.outputPath, {
        ...existing,
        generatedAt: now.toISOString(),
        usedFallback: true,
      });
      return;
    }
  }

  await writeOutput(args.outputPath, payload);

  const successCount = memberFeeds.length - failures.length;
  console.log(
    `[feeds] Wrote ${totalItems} item(s) from ${successCount}/${memberFeeds.length} feed(s) to ${path.relative(process.cwd(), args.outputPath)}.`,
  );
  if (failures.length) {
    failures.forEach((failure) => {
      console.warn(`[feeds] Failed: ${failure.source} -> ${failure.error}`);
    });
  }
}

main().catch((error) => {
  console.error("[feeds] Unhandled error:", error);
  process.exit(1);
});
