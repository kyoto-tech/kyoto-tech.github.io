import { buildMeetupVenueMapsUrl, normalizeMeetupEventTitle, type MeetupEvent } from "./meetup-events";
import { getSafeWebUrl } from "./safe-url";

export type WebMcpMemberPost = {
  id: string;
  title: string;
  link: string;
  publishedAt: string;
  summary?: string;
  sourceName: string;
  sourceUrl?: string;
};

export type WebMcpData = {
  events: MeetupEvent[];
  memberPosts: WebMcpMemberPost[];
  links: Record<string, string>;
};

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; untrustedContentHint: boolean };
  // eslint-disable-next-line no-unused-vars
  execute: (input: Record<string, unknown>) => unknown;
};

type DocumentLike = {
  // eslint-disable-next-line no-unused-vars
  modelContext?: { registerTool?: (tool: Tool) => Promise<unknown> };
};

type NavigatorLike = {
  // eslint-disable-next-line no-unused-vars
  modelContext?: { provideContext?: (context: { tools: Tool[] }) => unknown };
};

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const limitSchema = {
  type: "integer",
  minimum: 1,
  maximum: 10,
  default: 5,
};

function boundedLimit(value: unknown, fallback = 5): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(10, Math.max(1, value));
}

function safeEvent(event: MeetupEvent) {
  const link = getSafeWebUrl(event.link);
  if (!link) return null;
  const mapsUrl = buildMeetupVenueMapsUrl(event.venue);
  return {
    id: link,
    title: normalizeMeetupEventTitle(event.title),
    start: event.start,
    endTime: event.endTime,
    timezone: "Asia/Tokyo",
    venue: event.venue,
    goingCount: event.goingCount,
    interestedCount: event.interestedCount,
    eventType: event.eventType,
    rsvpUrl: link,
    mapsUrl,
  };
}

function safePost(post: WebMcpMemberPost) {
  const link = getSafeWebUrl(post.link);
  if (!link) return null;
  return {
    id: post.id || link,
    title: post.title,
    link,
    publishedAt: post.publishedAt,
    summary: post.summary ?? "",
    sourceName: post.sourceName,
    sourceUrl: getSafeWebUrl(post.sourceUrl),
  };
}

export function createWebMcpTools(data: WebMcpData): Tool[] {
  const events = data.events
    .map(safeEvent)
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const posts = data.memberPosts
    .map(safePost)
    .filter((post): post is NonNullable<typeof post> => Boolean(post));

  return [
    {
      name: "get_next_meetup",
      title: "Get the next Kyoto Tech Meetup",
      description: "Find the next upcoming Kyoto Tech Meetup and its RSVP and map links.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ event: events[0] ?? null }),
    },
    {
      name: "list_upcoming_meetups",
      title: "List upcoming Kyoto Tech Meetups",
      description: "List a bounded number of upcoming Kyoto Tech Meetup events.",
      inputSchema: {
        type: "object",
        properties: { limit: limitSchema },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => ({ events: events.slice(0, boundedLimit(input.limit)) }),
    },
    {
      name: "get_event_details",
      title: "Get meetup event details",
      description: "Get the details and links for one event returned by the meetup tools.",
      inputSchema: {
        type: "object",
        properties: { eventId: { type: "string", minLength: 1 } },
        required: ["eventId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => ({ event: events.find((event) => event.id === input.eventId) ?? null }),
    },
    {
      name: "get_community_links",
      title: "Get Kyoto Tech Meetup community links",
      description: "Get the official Meetup, Discord, GitHub, LinkedIn, contact, and calendar links.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ links: data.links }),
    },
    {
      name: "list_member_posts",
      title: "List member publications",
      description: "List recent items from the homepage's What members are publishing section.",
      inputSchema: {
        type: "object",
        properties: { limit: limitSchema, source: { type: "string", maxLength: 100 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => {
        const source = typeof input.source === "string" ? input.source.toLowerCase() : null;
        const filtered = source ? posts.filter((post) => post.sourceName.toLowerCase() === source) : posts;
        return { posts: filtered.slice(0, boundedLimit(input.limit)) };
      },
    },
    {
      name: "get_member_post",
      title: "Get a member publication",
      description: "Get one published member item from the homepage feed by its stable ID.",
      inputSchema: {
        type: "object",
        properties: { postId: { type: "string", minLength: 1 } },
        required: ["postId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => ({ post: posts.find((post) => post.id === input.postId) ?? null }),
    },
    {
      name: "search_member_posts",
      title: "Search member publications",
      description: "Search the published member items shown on the homepage by title, summary, or source.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 1, maxLength: 200 }, limit: limitSchema },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => {
        const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
        if (!query) return { posts: [] };
        const matches = posts.filter((post) =>
          [post.title, post.summary, post.sourceName].some((value) => value.toLowerCase().includes(query)),
        );
        return { posts: matches.slice(0, boundedLimit(input.limit)) };
      },
    },
  ];
}

export async function registerWebMcpTools(
  data: WebMcpData,
  documentLike: DocumentLike | undefined = globalThis.document as unknown as DocumentLike,
  navigatorLike: NavigatorLike | undefined = globalThis.navigator as unknown as NavigatorLike,
): Promise<"registerTool" | "provideContext" | false> {
  const tools = createWebMcpTools(data);
  const modernContext = documentLike?.modelContext;
  if (modernContext?.registerTool) {
    for (const tool of tools) await modernContext.registerTool(tool);
    return "registerTool";
  }

  const legacyContext = navigatorLike?.modelContext;
  if (legacyContext?.provideContext) {
    legacyContext.provideContext({ tools });
    return "provideContext";
  }

  return false;
}
