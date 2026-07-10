import { describe, expect, test } from "vitest";
import { acceptsMarkdown } from "../functions/_lib/markdown.js";
import { buildAgentMarkdown } from "../scripts/agent-markdown.mjs";

describe("agent Markdown negotiation", () => {
  test("recognizes an explicit Markdown preference", () => {
    expect(acceptsMarkdown("text/markdown")).toBe(true);
    expect(acceptsMarkdown("text/html, text/markdown;q=0.9")).toBe(true);
    expect(acceptsMarkdown("text/markdown;q=0")).toBe(false);
    expect(acceptsMarkdown("text/html, */*;q=0.8")).toBe(false);
  });
});

describe("agent Markdown content", () => {
  test("includes current events and curated member posts", () => {
    const markdown = buildAgentMarkdown({
      now: new Date("2026-07-10T00:00:00Z"),
      eventsSnapshot: {
        generatedAt: "2026-07-10T00:00:00Z",
        events: [
          {
            title: "Next meetup",
            link: "https://www.meetup.com/kyoto-tech-meetup/events/123/",
            start: "2026-07-20T09:00:00+09:00",
            goingCount: 4,
            venue: { name: "Kyoto Cafe", city: "Kyoto", country: "JP" },
          },
          {
            title: "Past meetup",
            link: "https://www.meetup.com/kyoto-tech-meetup/events/old/",
            start: "2026-07-01T09:00:00+09:00",
            goingCount: 1,
          },
        ],
      },
      feedSnapshot: {
        generatedAt: "2026-07-10T00:00:00Z",
        feeds: [
          {
            name: "Member One",
            items: [
              {
                title: "A published post",
                link: "https://example.com/post",
                publishedAt: "2026-07-09T00:00:00Z",
              },
              {
                title: "Unsafe item",
                link: "javascript:alert(1)",
                publishedAt: "2026-07-10T00:00:00Z",
              },
            ],
          },
        ],
      },
    });

    expect(markdown).toContain("## Next and upcoming meetups");
    expect(markdown).toContain("Next meetup");
    expect(markdown).not.toContain("Past meetup");
    expect(markdown).toContain("## What members are publishing");
    expect(markdown).toContain("A published post");
    expect(markdown).not.toContain("Unsafe item");
    expect(markdown).toContain("Join Discord");
  });
});
