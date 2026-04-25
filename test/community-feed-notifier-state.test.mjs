import { expect, test } from "vitest";
import {
  buildDiscordPayload,
  buildMessage,
  defaultState,
  parseState,
  upsertStateRecord,
} from "../scripts/lib/community-feed-notifier-state.mjs";

function sampleItem(overrides = {}) {
  return {
    id: "https://example.com/feed.xml::post-1",
    sourceItemId: "post-1",
    title: "Post One",
    link: "https://example.com/post-1",
    publishedAt: "2026-04-25T05:35:48.687Z",
    summary: "A useful post",
    source: {
      name: "Example Author",
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com/",
    },
    ...overrides,
  };
}

test("defaultState creates an empty notifier state", () => {
  expect(defaultState()).toEqual({
    version: 1,
    initializedAt: null,
    updatedAt: null,
    items: {},
  });
});

test("parseState normalizes missing or malformed state fields", () => {
  expect(parseState("null")).toEqual(defaultState());
  expect(
    parseState(
      JSON.stringify({
        version: "2",
        initializedAt: 123,
        updatedAt: "2026-04-25T05:35:48.687Z",
        items: [],
      }),
    ),
  ).toEqual({
    version: 2,
    initializedAt: null,
    updatedAt: "2026-04-25T05:35:48.687Z",
    items: {},
  });
});

test("upsertStateRecord inserts a new item with suppression and channel defaults", () => {
  const state = defaultState();
  const record = upsertStateRecord(
    state,
    sampleItem(),
    "2026-04-25T06:00:00.000Z",
    { suppressed: true },
  );

  expect(record).toMatchObject({
    id: "https://example.com/feed.xml::post-1",
    sourceItemId: "post-1",
    firstSeenAt: "2026-04-25T06:00:00.000Z",
    lastSeenAt: "2026-04-25T06:00:00.000Z",
    suppressed: true,
    channels: {},
  });
  expect(state.items[record.id]).toBe(record);
});

test("upsertStateRecord preserves firstSeenAt, suppression, and delivery channels", () => {
  const item = sampleItem();
  const state = {
    ...defaultState(),
    items: {
      [item.id]: {
        ...item,
        firstSeenAt: "2026-04-24T00:00:00.000Z",
        lastSeenAt: "2026-04-24T00:00:00.000Z",
        suppressed: false,
        channels: {
          discord: {
            deliveredAt: "2026-04-24T00:01:00.000Z",
          },
        },
      },
    },
  };

  const record = upsertStateRecord(
    state,
    sampleItem({ title: "Updated title" }),
    "2026-04-25T06:00:00.000Z",
    { suppressed: true },
  );

  expect(record.firstSeenAt).toBe("2026-04-24T00:00:00.000Z");
  expect(record.lastSeenAt).toBe("2026-04-25T06:00:00.000Z");
  expect(record.suppressed).toBe(false);
  expect(record.channels.discord.deliveredAt).toBe("2026-04-24T00:01:00.000Z");
  expect(record.title).toBe("Updated title");
});

test("buildMessage formats a plain text destination message", () => {
  expect(buildMessage(sampleItem())).toBe(
    [
      "New community post from Example Author",
      "Post One",
      "https://example.com/post-1",
    ].join("\n"),
  );
});

test("buildDiscordPayload formats the Discord webhook payload", () => {
  expect(buildDiscordPayload(sampleItem())).toEqual({
    content: "New community post from **Example Author**",
    embeds: [
      {
        title: "Post One",
        url: "https://example.com/post-1",
        description: "A useful post",
        timestamp: "2026-04-25T05:35:48.687Z",
        author: {
          name: "Example Author",
          url: "https://example.com/",
        },
        footer: {
          text: "https://example.com/",
        },
      },
    ],
  });
});

test("buildDiscordPayload omits empty summaries from embed description", () => {
  const payload = buildDiscordPayload(sampleItem({ summary: "" }));
  expect(payload.embeds[0]).not.toHaveProperty("description");
});
