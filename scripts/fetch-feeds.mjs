import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Parser from "rss-parser";
import {
  fetchRawFeedItems,
  fetchText,
  isYoutubeUrl,
  loadMemberFeeds,
  normalizeAndLimitFeedItems,
  parseDate,
  stripHtml,
  truncate,
} from "./lib/community-feed-reader.mjs";

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.env.COMPOSITE_FEED_OUTPUT || "src/data/composite-feed.json",
);
const DEFAULT_ITEMS_PER_FEED = Number(
  process.env.COMPOSITE_FEED_ITEMS_PER_FEED || 3,
);
const FEED_TIMEOUT_MS = Number(process.env.COMPOSITE_FEED_TIMEOUT_MS || 12000);
const ITEM_PAGE_TIMEOUT_MS = Number(
  process.env.COMPOSITE_FEED_ITEM_PAGE_TIMEOUT_MS || 8000,
);
const USER_AGENT =
  "Kyoto Tech Meetup feed aggregator (+https://kyototechmeetup.com)";

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

const IMAGE_FILE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const NON_IMAGE_FILE_EXTENSIONS = new Set([
  ".m4v",
  ".mov",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".ogg",
  ".ogv",
  ".wav",
  ".webm",
]);

function extractMediaCandidate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return value.startsWith("http") ? { url: value } : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = extractMediaCandidate(entry);
      if (candidate) return candidate;
    }
    return null;
  }
  if (typeof value === "object") {
    const url = value.url ?? value.href ?? value.$?.url;
    if (typeof url !== "string" || !url.startsWith("http")) return null;

    return {
      url,
      type: value.type ?? value.$?.type ?? null,
      medium: value.medium ?? value.$?.medium ?? null,
    };
  }
  return null;
}

function getUrlExtension(rawUrl) {
  try {
    return path.extname(new URL(rawUrl).pathname).toLowerCase();
  } catch {
    return "";
  }
}

export function isImageMediaCandidate(
  candidate,
  { semanticImage = false } = {},
) {
  if (!candidate?.url || typeof candidate.url !== "string") return false;

  const mimeType = String(candidate.type ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const medium = String(candidate.medium ?? "").trim().toLowerCase();
  const extension = getUrlExtension(candidate.url);

  if (mimeType.startsWith("image/")) return true;
  if (
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    medium === "video" ||
    medium === "audio" ||
    NON_IMAGE_FILE_EXTENSIONS.has(extension)
  ) {
    return false;
  }

  if (IMAGE_FILE_EXTENSIONS.has(extension)) return true;
  return semanticImage;
}

function findImageMediaUrl(value, options = {}) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const imageUrl = findImageMediaUrl(entry, options);
      if (imageUrl) return imageUrl;
    }
    return null;
  }

  const candidate = extractMediaCandidate(value);
  return isImageMediaCandidate(candidate, options) ? candidate.url : null;
}

function toHtmlString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const html = toHtmlString(entry);
      if (html) return html;
    }
    return "";
  }
  if (typeof value === "object") {
    if (typeof value._ === "string") return value._;
    if (typeof value["#text"] === "string") return value["#text"];
  }
  return "";
}

function resolveImageUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("//")) {
    return `https:${rawUrl}`;
  }

  if (!baseUrl) return null;
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractFirstImageFromHtml(value, baseUrl) {
  const html = toHtmlString(value);
  if (!html) return null;

  const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const srcUrl = resolveImageUrl(srcMatch?.[1], baseUrl);
  if (srcUrl) return srcUrl;

  const dataSrcMatch = html.match(/<img[^>]+data-src=["']([^"']+)["']/i);
  const dataSrcUrl = resolveImageUrl(dataSrcMatch?.[1], baseUrl);
  if (dataSrcUrl) return dataSrcUrl;

  const srcsetMatch = html.match(/<img[^>]+srcset=["']([^"']+)["']/i);
  if (srcsetMatch?.[1]) {
    const firstCandidate = srcsetMatch[1].split(",")[0]?.trim().split(/\s+/)[0];
    const srcsetUrl = resolveImageUrl(firstCandidate, baseUrl);
    if (srcsetUrl) return srcsetUrl;
  }

  return null;
}

function getHtmlAttribute(tag, attribute) {
  if (!tag || !attribute) return null;
  const quoted = tag.match(
    new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"),
  );
  if (quoted?.[1]) return quoted[1];

  const unquoted = tag.match(
    new RegExp(`${attribute}\\s*=\\s*([^\\s"'/>]+)`, "i"),
  );
  return unquoted?.[1] || null;
}

function extractImageFromTag(tag, baseUrl) {
  const source =
    getHtmlAttribute(tag, "src") || getHtmlAttribute(tag, "data-src");
  const sourceUrl = resolveImageUrl(source, baseUrl);
  if (sourceUrl) return sourceUrl;

  const srcset = getHtmlAttribute(tag, "srcset");
  const firstCandidate = srcset?.split(",")[0]?.trim().split(/\s+/)[0];
  return resolveImageUrl(firstCandidate, baseUrl);
}

function extractWordpressFeaturedImage(html, baseUrl) {
  if (!html || typeof html !== "string") return null;

  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const imageTag of imageTags) {
    const className = getHtmlAttribute(imageTag, "class") || "";
    if (!className.split(/\s+/).includes("wp-post-image")) continue;

    const imageUrl = extractImageFromTag(imageTag, baseUrl);
    if (imageUrl) return imageUrl;
  }

  return null;
}

function extractMetaImageFromHtml(html, baseUrl) {
  if (!html || typeof html !== "string") return null;

  const imageKeys = new Set([
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
  ]);

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const metaTag of metaTags) {
    const property = (getHtmlAttribute(metaTag, "property") || "").toLowerCase();
    const name = (getHtmlAttribute(metaTag, "name") || "").toLowerCase();
    const itemProp = (getHtmlAttribute(metaTag, "itemprop") || "").toLowerCase();
    const content = getHtmlAttribute(metaTag, "content");

    if (!content) continue;
    if (
      imageKeys.has(property) ||
      imageKeys.has(name) ||
      itemProp === "image"
    ) {
      const imageUrl = resolveImageUrl(content, baseUrl);
      if (
        imageUrl &&
        isImageMediaCandidate({ url: imageUrl }, { semanticImage: true })
      ) {
        return imageUrl;
      }
    }
  }

  return null;
}

export function extractPageImage(html, pageUrl) {
  return (
    extractMetaImageFromHtml(html, pageUrl) ||
    extractWordpressFeaturedImage(html, pageUrl) ||
    extractFirstImageFromHtml(html, pageUrl)
  );
}

function normalizeYoutubeVideoId(candidate) {
  if (!candidate || typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

function extractYoutubeVideoId(rawItem) {
  const directCandidates = [
    rawItem["yt:videoId"],
    rawItem.videoId,
    rawItem["youtube:videoId"],
  ];

  for (const candidate of directCandidates) {
    const videoId = normalizeYoutubeVideoId(candidate);
    if (videoId) return videoId;
  }

  const idCandidates = [rawItem.id, rawItem.guid];
  for (const candidate of idCandidates) {
    if (typeof candidate !== "string") continue;
    const match = candidate.match(/yt:video:([A-Za-z0-9_-]{11})/i);
    const videoId = normalizeYoutubeVideoId(match?.[1]);
    if (videoId) return videoId;
  }

  if (typeof rawItem.link !== "string") return null;
  try {
    const link = new URL(rawItem.link);
    if (link.hostname === "youtu.be") {
      const fromPath = normalizeYoutubeVideoId(link.pathname.replace(/^\//, ""));
      if (fromPath) return fromPath;
    }
    if (isYoutubeUrl(link.href) || link.hostname === "music.youtube.com") {
      const fromQuery = normalizeYoutubeVideoId(link.searchParams.get("v"));
      if (fromQuery) return fromQuery;

      const pathMatch = link.pathname.match(
        /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
      );
      const fromPath = normalizeYoutubeVideoId(pathMatch?.[1]);
      if (fromPath) return fromPath;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveFeedImage(rawItem, source) {
  const enclosureUrl = findImageMediaUrl(rawItem.enclosure);
  if (enclosureUrl) return enclosureUrl;

  const mediaCandidates = [
    { value: rawItem["media:thumbnail"], semanticImage: true },
    { value: rawItem.mediaThumbnail, semanticImage: true },
    {
      value: rawItem["media:group"]?.["media:thumbnail"],
      semanticImage: true,
    },
    {
      value: rawItem["media_group"]?.["media:thumbnail"],
      semanticImage: true,
    },
    { value: rawItem["media:content"], semanticImage: false },
    {
      value: rawItem["media:group"]?.["media:content"],
      semanticImage: false,
    },
    {
      value: rawItem["media_group"]?.["media:content"],
      semanticImage: false,
    },
  ];
  for (const { value, semanticImage } of mediaCandidates) {
    const mediaUrl = findImageMediaUrl(value, { semanticImage });
    if (mediaUrl) return mediaUrl;
  }

  if (isYoutubeUrl(source?.feedUrl) || isYoutubeUrl(source?.siteUrl)) {
    const videoId = extractYoutubeVideoId(rawItem);
    if (videoId) {
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  }

  return null;
}

function resolveInlineContentImage(rawItem, source) {
  const baseUrl =
    (typeof rawItem.link === "string" && rawItem.link) ||
    (typeof source?.siteUrl === "string" && source.siteUrl) ||
    null;

  const htmlCandidates = [
    rawItem["content:encoded"],
    rawItem.content,
    rawItem.summary,
    rawItem.description,
    rawItem["media:description"],
    rawItem["media:group"]?.["media:description"],
    rawItem["media_group"]?.["media:description"],
  ];
  for (const candidate of htmlCandidates) {
    const inlineImage = extractFirstImageFromHtml(candidate, baseUrl);
    if (inlineImage) return inlineImage;
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
    image: resolveFeedImage(rawItem, source),
    inlineImage: resolveInlineContentImage(rawItem, source),
  };
}

export async function enrichItemWithLinkedPageImage(
  item,
  { fetchTextFn = fetchText } = {},
) {
  const { inlineImage, ...publicItem } = item;
  if (publicItem.image) return publicItem;
  if (
    typeof publicItem.link !== "string" ||
    (!publicItem.link.startsWith("http://") &&
      !publicItem.link.startsWith("https://"))
  ) {
    return { ...publicItem, image: inlineImage ?? null };
  }

  try {
    const html = await fetchTextFn(
      publicItem.link,
      {},
      ITEM_PAGE_TIMEOUT_MS,
      USER_AGENT,
    );
    const image = extractPageImage(html, publicItem.link);
    return {
      ...publicItem,
      image: image ?? inlineImage ?? null,
    };
  } catch {
    return { ...publicItem, image: inlineImage ?? null };
  }
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
      const rawItems = await fetchRawFeedItems(source, {
        parser,
        feedTimeoutMs: FEED_TIMEOUT_MS,
        userAgent: USER_AGENT,
      });
      const normalizedItems = normalizeAndLimitFeedItems(rawItems, source, {
        maxItemsPerFeed: args.itemsPerFeed,
        normalizeItem,
      });

      const itemsWithLinkedPageImages = await Promise.all(
        normalizedItems.map((item) => enrichItemWithLinkedPageImage(item)),
      );

      feedsWithItems.push({
        name: source.name,
        siteUrl: source.siteUrl,
        feedUrl: source.feedUrl,
        items: itemsWithLinkedPageImages,
      });
    } catch (error) {
      failures.push({ source: source.name, error: error?.message || String(error) });
      feedsWithItems.push({
        name: source.name,
        siteUrl: source.siteUrl,
        feedUrl: source.feedUrl,
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

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    console.error("[feeds] Unhandled error:", error);
    process.exit(1);
  });
}
