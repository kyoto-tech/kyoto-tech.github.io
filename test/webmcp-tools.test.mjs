import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { createWebMcpTools, registerWebMcpTools } from "../src/lib/webmcp-tools.ts";

const data = {
  events: [
    {
      title: "Next meetup",
      link: "https://www.meetup.com/kyoto-tech-meetup/events/123/",
      start: "2026-07-20T09:00:00+09:00",
      endTime: null,
      description: "Event description",
      image: null,
      goingCount: 4,
      interestedCount: 10,
      eventType: "coffee",
      venue: { name: "Kyoto Cafe", city: "Kyoto", country: "JP" },
    },
  ],
  memberPosts: [
    {
      id: "post-1",
      title: "Published post",
      link: "https://example.com/post",
      publishedAt: "2026-07-10T00:00:00Z",
      summary: "A useful article",
      sourceName: "Member One",
      sourceUrl: "https://example.com/",
    },
  ],
  links: { meetup: "https://www.meetup.com/kyoto-tech-meetup/" },
};

describe("WebMCP tools", () => {
  test("exposes the read-only event and published-content footprint", async () => {
    const tools = createWebMcpTools(data);
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_next_meetup",
      "list_upcoming_meetups",
      "get_event_details",
      "get_community_links",
      "list_member_posts",
      "get_member_post",
      "search_member_posts",
    ]);
    expect(tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    expect(tools.find((tool) => tool.name === "get_next_meetup").execute({})).toMatchObject({
      event: { title: "Next meetup", rsvpUrl: data.events[0].link },
    });
    expect(tools.find((tool) => tool.name === "search_member_posts").execute({ query: "article" })).toMatchObject({
      posts: [{ id: "post-1" }],
    });
  });

  test("keeps the maintenance skill aware of the public tool footprint", () => {
    const skill = fs.readFileSync("public/.well-known/agent-skills/webmcp-maintenance/SKILL.md", "utf8");
    for (const toolName of [
      "get_next_meetup",
      "list_upcoming_meetups",
      "get_event_details",
      "get_community_links",
      "list_member_posts",
      "get_member_post",
      "search_member_posts",
    ]) {
      expect(skill).toContain(toolName);
    }
  });

  test("registers modern and legacy browser APIs, and fails closed", async () => {
    const registrations = [];
    const modern = { modelContext: { registerTool: async (tool) => registrations.push(tool.name) } };
    expect(await registerWebMcpTools(data, modern, undefined)).toBe("registerTool");
    expect(registrations).toHaveLength(7);

    let legacyTools;
    const legacy = { modelContext: { provideContext: (context) => { legacyTools = context.tools; } } };
    expect(await registerWebMcpTools(data, undefined, legacy)).toBe("provideContext");
    expect(legacyTools).toHaveLength(7);
    expect(await registerWebMcpTools(data, undefined, undefined)).toBe(false);
  });
});
