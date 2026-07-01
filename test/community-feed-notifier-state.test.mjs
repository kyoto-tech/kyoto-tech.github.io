import { expect, test } from "vitest";
import {
  buildDiscordPayload,
  buildMessage,
  defaultState,
  migrateStateItemIds,
  parseState,
  upsertStateRecord,
} from "../scripts/lib/community-feed-notifier-state.mjs";

function sampleItem(overrides = {}) {
  return {
    id: "example-author::post-1",
    sourceItemId: "post-1",
    title: "Post One",
    link: "https://example.com/post-1",
    publishedAt: "2026-04-25T05:35:48.687Z",
    summary: "A useful post",
    source: {
      id: "example-author",
      name: "Example Author",
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com/",
    },
    ...overrides,
  };
}

test("defaultState creates an empty notifier state", () => {
  expect(defaultState()).toEqual({
    version: 3,
    initializedAt: null,
    updatedAt: null,
    items: {},
    events: {},
    weeklyDigest: {},
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
    events: {},
    weeklyDigest: {},
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
    id: "example-author::post-1",
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

test("upsertStateRecord migrates a legacy item key while preserving history", () => {
  const item = sampleItem();
  const legacyId = "https://example.com/feed.xml::post-1";
  const state = {
    ...defaultState(),
    items: {
      [legacyId]: {
        ...item,
        id: legacyId,
        firstSeenAt: "2026-04-24T00:00:00.000Z",
        lastSeenAt: "2026-04-24T00:00:00.000Z",
        suppressed: true,
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
    item,
    "2026-04-25T06:00:00.000Z",
  );

  expect(record.id).toBe("example-author::post-1");
  expect(record.firstSeenAt).toBe("2026-04-24T00:00:00.000Z");
  expect(record.suppressed).toBe(true);
  expect(record.channels.discord.deliveredAt).toBe("2026-04-24T00:01:00.000Z");
  expect(state.items[legacyId]).toBeUndefined();
  expect(state.items[item.id]).toBe(record);
});

test("migrateStateItemIds converts legacy gist keys to source-stable keys", () => {
  const legacyId = "https://example.com/feed.xml::post-1";
  const state = {
    version: 1,
    initializedAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    items: {
      [legacyId]: {
        ...sampleItem({ id: legacyId }),
        firstSeenAt: "2026-04-24T00:00:00.000Z",
        lastSeenAt: "2026-04-24T00:00:00.000Z",
        suppressed: true,
        channels: {
          discord: {
            deliveredAt: "2026-04-24T00:01:00.000Z",
          },
        },
      },
    },
  };

  const result = migrateStateItemIds(state, [
    {
      id: "example-author",
      name: "Example Author",
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com/",
    },
  ]);

  expect(result).toEqual({
    changed: true,
    migratedCount: 1,
  });
  expect(state.version).toBe(3);
  expect(state.items[legacyId]).toBeUndefined();
  expect(state.items["example-author::post-1"]).toMatchObject({
    id: "example-author::post-1",
    firstSeenAt: "2026-04-24T00:00:00.000Z",
    lastSeenAt: "2026-04-24T00:00:00.000Z",
    suppressed: true,
    channels: {
      discord: {
        deliveredAt: "2026-04-24T00:01:00.000Z",
      },
    },
  });
});

// --- v2→v3 migration tests (Req 14.1, 17.5) ---

test("parseState with v2 state (missing events and weeklyDigest) defaults those to {}", () => {
  const v2State = JSON.stringify({
    version: 2,
    initializedAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    items: { "some-id::post-1": { id: "some-id::post-1", title: "Post" } },
  });
  const result = parseState(v2State);
  expect(result.events).toEqual({});
  expect(result.weeklyDigest).toEqual({});
  expect(result.items).toEqual({ "some-id::post-1": { id: "some-id::post-1", title: "Post" } });
  expect(result.version).toBe(2);
});

test("parseState with events and weeklyDigest as invalid types defaults to {}", () => {
  const withArray = JSON.stringify({
    version: 3,
    initializedAt: null,
    updatedAt: null,
    items: {},
    events: ["not", "an", "object"],
    weeklyDigest: null,
  });
  const result = parseState(withArray);
  expect(result.events).toEqual({});
  expect(result.weeklyDigest).toEqual({});
});

test("parseState with valid v3 state preserves events and weeklyDigest data", () => {
  const v3State = JSON.stringify({
    version: 3,
    initializedAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    items: {},
    events: { "https://meetup.com/event/1": { deliveredAt: "2026-04-24T08:00:00.000Z" } },
    weeklyDigest: { "2026-W17": { deliveredAt: "2026-04-21T08:00:00.000Z" } },
  });
  const result = parseState(v3State);
  expect(result.events).toEqual({ "https://meetup.com/event/1": { deliveredAt: "2026-04-24T08:00:00.000Z" } });
  expect(result.weeklyDigest).toEqual({ "2026-W17": { deliveredAt: "2026-04-21T08:00:00.000Z" } });
});

test("defaultState() returns v3 shape with events and weeklyDigest", () => {
  const state = defaultState();
  expect(state.version).toBe(3);
  expect(state).toHaveProperty("events", {});
  expect(state).toHaveProperty("weeklyDigest", {});
  expect(state).toHaveProperty("items", {});
});

test("migrateStateItemIds on a v2 state adds events and weeklyDigest, bumps version, preserves items", () => {
  const state = {
    version: 2,
    initializedAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    items: {
      "author-a::post-1": {
        id: "author-a::post-1",
        sourceItemId: "post-1",
        title: "Existing Post",
        source: { id: "author-a", feedUrl: "https://a.com/feed.xml" },
      },
    },
  };

  const result = migrateStateItemIds(state, [
    { id: "author-a", name: "Author A", feedUrl: "https://a.com/feed.xml", siteUrl: "https://a.com/" },
  ]);

  expect(result.changed).toBe(true);
  expect(state.version).toBe(3);
  expect(state.events).toEqual({});
  expect(state.weeklyDigest).toEqual({});
  // items are preserved untouched (key didn't change because it already uses source id format)
  expect(state.items["author-a::post-1"]).toMatchObject({
    id: "author-a::post-1",
    title: "Existing Post",
  });
});

test("migrateStateItemIds on a v3 state does not alter existing events and weeklyDigest", () => {
  const state = {
    version: 3,
    initializedAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    items: {
      "author-b::post-2": {
        id: "author-b::post-2",
        sourceItemId: "post-2",
        title: "Another Post",
        source: { id: "author-b", feedUrl: "https://b.com/feed.xml" },
      },
    },
    events: { "https://meetup.com/event/1": { deliveredAt: "2026-04-24T08:00:00.000Z" } },
    weeklyDigest: { "2026-W17": { deliveredAt: "2026-04-21T08:00:00.000Z" } },
  };

  const result = migrateStateItemIds(state, [
    { id: "author-b", name: "Author B", feedUrl: "https://b.com/feed.xml", siteUrl: "https://b.com/" },
  ]);

  expect(result.changed).toBe(false);
  expect(state.version).toBe(3);
  expect(state.events).toEqual({ "https://meetup.com/event/1": { deliveredAt: "2026-04-24T08:00:00.000Z" } });
  expect(state.weeklyDigest).toEqual({ "2026-W17": { deliveredAt: "2026-04-21T08:00:00.000Z" } });
  expect(state.items["author-b::post-2"]).toMatchObject({ id: "author-b::post-2", title: "Another Post" });
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

test("buildDiscordPayload includes a relevant item image when available", () => {
  const payload = buildDiscordPayload(
    sampleItem({ imageUrl: "https://example.com/images/post-1.jpg" }),
  );

  expect(payload.embeds[0].image).toEqual({
    url: "https://example.com/images/post-1.jpg",
  });
});
