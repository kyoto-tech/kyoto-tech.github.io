import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  fetchFeedItems,
  fetchRawFeedItems,
  enrichNotifierItemWithLinkedPageImage,
  loadMemberFeeds,
  normalizeNotifierItem,
  parseDate,
  parseYoutubeChannelId,
  resolveFeedUrl,
  stripHtml,
  truncate,
} from "../scripts/lib/community-feed-reader.mjs";

test("loadMemberFeeds normalizes valid source entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feed-reader-"));
  const filePath = path.join(tempDir, "member-feeds.json");
  await fs.writeFile(
    filePath,
    JSON.stringify([
      {
        id: "example-author",
        name: "Example Author",
        feedUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com/",
      },
    ]),
  );

  await expect(loadMemberFeeds(filePath)).resolves.toEqual([
    {
      id: "example-author",
      name: "Example Author",
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com/",
    },
  ]);
});

test("loadMemberFeeds rejects malformed source entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feed-reader-"));
  const filePath = path.join(tempDir, "member-feeds.json");
  await fs.writeFile(filePath, JSON.stringify([{ name: "Missing URLs" }]));

  await expect(loadMemberFeeds(filePath)).rejects.toThrow(
    /Missing required fields in member feed entry/,
  );
});

test("loadMemberFeeds rejects active URL schemes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feed-reader-"));
  const filePath = path.join(tempDir, "member-feeds.json");
  await fs.writeFile(
    filePath,
    JSON.stringify([
      {
        id: "unsafe",
        name: "Unsafe",
        feedUrl: "https://example.com/feed.xml",
        siteUrl: "javascript:alert(1)",
      },
    ]),
  );

  await expect(loadMemberFeeds(filePath)).rejects.toThrow(/HTTP or HTTPS/);
});

test("parseDate accepts common RSS date fields and rejects invalid dates", () => {
  expect(
    parseDate({ isoDate: "2026-04-25T05:35:48.687Z" }).toISOString(),
  ).toBe("2026-04-25T05:35:48.687Z");
  expect(
    parseDate({ pubDate: "Sat, 25 Apr 2026 05:35:48 GMT" }).toISOString(),
  ).toBe("2026-04-25T05:35:48.000Z");
  expect(parseDate({ isoDate: "not a date" })).toBeNull();
  expect(parseDate({})).toBeNull();
});

test("stripHtml and truncate produce stable summaries", () => {
  expect(stripHtml("<p>Hello <strong>Kyoto</strong></p>")).toBe("Hello Kyoto");
  expect(truncate("abcdef", 6)).toBe("abcdef");
  expect(truncate("abcdef", 5)).toBe("ab...");
});

test("resolveFeedUrl resolves YouTube handles to channel feeds", async () => {
  const resolved = await resolveFeedUrl("https://www.youtube.com/@example", {
    fetchTextFn: async () =>
      '{"externalId":"UC1234567890123456789012","title":"Example"}',
  });

  expect(resolved).toBe(
    "https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890123456789012",
  );
});

test("fetchRawFeedItems retries a transient YouTube feed failure", async () => {
  let attempts = 0;
  const parser = {
    async parseString(xml) {
      expect(xml).toBe("<feed />");
      return { items: [] };
    },
  };
  const items = await fetchRawFeedItems(
    {
      id: "video-author",
      name: "Video Author",
      feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890123456789012",
      siteUrl: "https://www.youtube.com/@example",
    },
    {
      parser,
      fetchTextFn: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("HTTP 404");
        return "<feed />";
      },
    },
  );

  expect(items).toEqual([]);
  expect(attempts).toBe(2);
});

test("parseYoutubeChannelId supports common channel id locations", () => {
  expect(
    parseYoutubeChannelId('{"channelId":"UCabcdefabcdefabcdefabcd"}'),
  ).toBe("UCabcdefabcdefabcdefabcd");
  expect(
    parseYoutubeChannelId("https://www.youtube.com/channel/UCabcdefabcdefabcdefabcd"),
  ).toBe("UCabcdefabcdefabcdefabcd");
  expect(parseYoutubeChannelId("no channel here")).toBeNull();
});

test("normalizeNotifierItem uses source-stable notifier item IDs", () => {
  const source = {
    id: "example-author",
    name: "Example Author",
    feedUrl: "https://example.com/feed.xml",
    siteUrl: "https://example.com/",
  };
  const item = normalizeNotifierItem(
    {
      guid: "post-1",
      title: "Post One",
      link: "https://example.com/post-1",
      isoDate: "2026-04-25T05:35:48.687Z",
      description: "<p>A useful post</p>",
    },
    source,
  );

  expect(item.id).toBe("example-author::post-1");
  expect(item.sourceItemId).toBe("post-1");
  expect(item.summary).toBe("A useful post");
  expect(item.source).toEqual(source);
});

test("normalizeNotifierItem falls back when an item link uses an active scheme", () => {
  const source = {
    id: "example-author",
    name: "Example Author",
    feedUrl: "https://example.com/feed.xml",
    siteUrl: "https://example.com/",
  };
  const item = normalizeNotifierItem(
    {
      guid: "post-1",
      link: "javascript:alert(1)",
      isoDate: "2026-04-25T05:35:48.687Z",
    },
    source,
  );

  expect(item.link).toBe(source.siteUrl);
});

test("normalizeNotifierItem extracts image URLs from feed item media", () => {
  const source = {
    id: "example-author",
    name: "Example Author",
    feedUrl: "https://example.com/feed.xml",
    siteUrl: "https://example.com/",
  };
  const item = normalizeNotifierItem(
    {
      guid: "post-1",
      title: "Post One",
      link: "https://example.com/post-1",
      isoDate: "2026-04-25T05:35:48.687Z",
      enclosure: {
        url: "https://example.com/images/post-1.jpg",
        type: "image/jpeg",
      },
    },
    source,
  );

  expect(item.imageUrl).toBe("https://example.com/images/post-1.jpg");
});

test("enrichNotifierItemWithLinkedPageImage finds WordPress featured images", async () => {
  const item = normalizeNotifierItem(
    {
      guid: "post-1",
      title: "Post One",
      link: "https://example.com/post-1",
      isoDate: "2026-04-25T05:35:48.687Z",
    },
    {
      id: "example-author",
      name: "Example Author",
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com/",
    },
  );
  const enriched = await enrichNotifierItemWithLinkedPageImage(item, {
    fetchTextFn: async () => '<img class="wp-post-image" src="/featured.jpg">',
  });

  expect(enriched.imageUrl).toBe("https://example.com/featured.jpg");
});

test("fetchFeedItems fetches, normalizes, dedupes, sorts, and limits items", async () => {
  const source = {
    id: "example-author",
    name: "Example Author",
    feedUrl: "https://example.com/feed.xml",
    siteUrl: "https://example.com/",
  };
  const parser = {
    async parseString(xml) {
      expect(xml).toBe("<rss />");
      return {
        items: [
          {
            guid: "old",
            title: "Old",
            link: "https://example.com/old",
            isoDate: "2026-01-01T00:00:00.000Z",
          },
          {
            guid: "new",
            title: "New",
            link: "https://example.com/new",
            isoDate: "2026-04-01T00:00:00.000Z",
          },
          {
            guid: "new",
            title: "New duplicate",
            link: "https://example.com/new-duplicate",
            isoDate: "2026-04-02T00:00:00.000Z",
          },
        ],
      };
    },
  };

  const items = await fetchFeedItems(source, {
    parser,
    fetchTextFn: async (url) => {
      expect(url).toBe("https://example.com/feed.xml");
      return "<rss />";
    },
    maxItemsPerFeed: 2,
  });

  expect(items.map((item) => item.sourceItemId)).toEqual(["new", "old"]);
});
