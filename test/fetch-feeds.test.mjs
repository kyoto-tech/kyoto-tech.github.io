import { describe, expect, test, vi } from "vitest";
import {
  enrichItemWithLinkedPageImage,
  extractPageImage,
  getCachedFeedForSource,
  isImageMediaCandidate,
  resolveFeedImage,
} from "../scripts/fetch-feeds.mjs";

const blogSource = {
  name: "Example Author",
  siteUrl: "https://example.com/",
  feedUrl: "https://example.com/feed/",
};

describe("composite feed image selection", () => {
  test("finds a cached source by stable feed identity", () => {
    const cached = { feeds: [{ name: "Example Author", feedUrl: blogSource.feedUrl, items: [{ id: "old" }] }] };
    expect(getCachedFeedForSource(cached, blogSource)?.items).toEqual([{ id: "old" }]);
  });

  test("accepts image enclosures and rejects video enclosures", () => {
    expect(
      isImageMediaCandidate({
        url: "https://example.com/photo.jpg",
        type: "image/jpeg",
      }),
    ).toBe(true);
    expect(
      isImageMediaCandidate({
        url: "https://example.com/demo.mp4",
        type: "video/mp4",
      }),
    ).toBe(false);

    expect(
      resolveFeedImage(
        {
          enclosure: {
            url: "https://example.com/photo.jpg",
            type: "image/jpeg",
          },
        },
        blogSource,
      ),
    ).toBe("https://example.com/photo.jpg");
    expect(
      resolveFeedImage(
        {
          enclosure: {
            url: "https://example.com/demo.webm",
            type: "video/webm",
          },
        },
        blogSource,
      ),
    ).toBeNull();
  });

  test("keeps semantic media thumbnails and YouTube thumbnails", () => {
    expect(
      resolveFeedImage(
        {
          "media:thumbnail": {
            $: { url: "https://cdn.example.com/thumbnail?id=1" },
          },
        },
        blogSource,
      ),
    ).toBe("https://cdn.example.com/thumbnail?id=1");

    expect(
      resolveFeedImage(
        {
          videoId: "TGDS3K-1oZ4",
          enclosure: {
            url: "https://example.com/video.mp4",
            type: "video/mp4",
          },
        },
        {
          name: "Video Author",
          siteUrl: "https://www.youtube.com/@example",
          feedUrl: "https://www.youtube.com/@example",
        },
      ),
    ).toBe("https://i.ytimg.com/vi/TGDS3K-1oZ4/hqdefault.jpg");
  });

  test("prefers page metadata and WordPress featured images", () => {
    expect(
      extractPageImage(
        '<meta property="og:image" content="/social-card.png"><img class="wp-post-image" src="/featured.jpg">',
        "https://example.com/post/",
      ),
    ).toBe("https://example.com/social-card.png");

    expect(
      extractPageImage(
        '<img src="/site-logo.svg"><img class="attachment-post-thumbnail wp-post-image" src="/featured.jpg">',
        "https://example.com/post/",
      ),
    ).toBe("https://example.com/featured.jpg");
  });

  test("uses the linked-page featured image before an inline fallback", async () => {
    const fetchTextFn = vi.fn(async () =>
      '<img src="/site-logo.svg"><img class="wp-post-image" src="/featured.jpg">',
    );
    const item = await enrichItemWithLinkedPageImage(
      {
        id: "post-1",
        link: "https://example.com/post/",
        image: null,
        inlineImage: "https://example.com/inline.gif",
      },
      { fetchTextFn },
    );

    expect(item.image).toBe("https://example.com/featured.jpg");
    expect(item).not.toHaveProperty("inlineImage");
  });

  test("retains an inline image when linked-page enrichment fails", async () => {
    const item = await enrichItemWithLinkedPageImage(
      {
        id: "post-1",
        link: "https://example.com/post/",
        image: null,
        inlineImage: "https://example.com/inline.gif",
      },
      {
        fetchTextFn: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
    );

    expect(item.image).toBe("https://example.com/inline.gif");
    expect(item).not.toHaveProperty("inlineImage");
  });
});
