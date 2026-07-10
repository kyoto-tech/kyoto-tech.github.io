import { fetchJson, fetchWithTimeout } from "./community-feed-reader.mjs";

const CURRENT_STATE_VERSION = 3;
const GITHUB_API_ROOT = "https://api.github.com";
const DEFAULT_STATE_FILENAME = "community-feed-state.json";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_USER_AGENT =
  "Kyoto Tech Meetup notifier (+https://kyototechmeetup.com)";

export async function readStateFromGist(
  gistId,
  token,
  {
    filename = process.env.COMMUNITY_FEED_STATE_GIST_FILENAME || DEFAULT_STATE_FILENAME,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
  } = {},
) {
  const headers = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const gist = await fetchJson(
    `${GITHUB_API_ROOT}/gists/${gistId}`,
    { headers },
    requestTimeoutMs,
    userAgent,
  );
  const stateFile = gist?.files?.[filename];

  if (!stateFile?.content) {
    return defaultState();
  }

  return parseState(stateFile.content);
}

export async function writeStateToGist(
  gistId,
  token,
  state,
  {
    filename = process.env.COMMUNITY_FEED_STATE_GIST_FILENAME || DEFAULT_STATE_FILENAME,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
  } = {},
) {
  if (!token) {
    throw new Error("GH_GIST_TOKEN is required to update gist-backed state.");
  }

  const payload = {
    files: {
      [filename]: {
        content: `${JSON.stringify(state, null, 2)}\n`,
      },
    },
  };

  const response = await fetchWithTimeout(
    `${GITHUB_API_ROOT}/gists/${gistId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    requestTimeoutMs,
    userAgent,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update gist state: HTTP ${response.status} ${body}`.trim(),
    );
  }
}

export function defaultState() {
  return {
    version: CURRENT_STATE_VERSION,
    initializedAt: null,
    updatedAt: null,
    items: {},
    sources: {},
    events: {},
    weeklyDigest: {},
  };
}

export function parseState(content) {
  const parsed = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaultState();
  }

  return {
    version: Number(parsed.version) || CURRENT_STATE_VERSION,
    initializedAt:
      typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    items:
      parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
        ? parsed.items
        : {},
    sources:
      parsed.sources && typeof parsed.sources === "object" && !Array.isArray(parsed.sources)
        ? parsed.sources
        : {},
    events:
      parsed.events && typeof parsed.events === "object" && !Array.isArray(parsed.events)
        ? parsed.events
        : {},
    weeklyDigest:
      parsed.weeklyDigest && typeof parsed.weeklyDigest === "object" && !Array.isArray(parsed.weeklyDigest)
        ? parsed.weeklyDigest
        : {},
  };
}

function mergeChannels(targetChannels, sourceChannels) {
  return {
    ...(sourceChannels && typeof sourceChannels === "object" ? sourceChannels : {}),
    ...(targetChannels && typeof targetChannels === "object" ? targetChannels : {}),
  };
}

function earliestIsoDate(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return left < right ? left : right;
}

function latestIsoDate(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return left > right ? left : right;
}

function mergeStateRecords(target, source, id) {
  return {
    ...source,
    ...target,
    id,
    firstSeenAt: earliestIsoDate(target?.firstSeenAt, source?.firstSeenAt),
    lastSeenAt: latestIsoDate(target?.lastSeenAt, source?.lastSeenAt),
    suppressed: Boolean(target?.suppressed || source?.suppressed),
    channels: mergeChannels(target?.channels, source?.channels),
  };
}

function buildStateItemId(source, sourceItemId) {
  return `${source.id}::${String(sourceItemId)}`;
}

function buildLegacyStateItemId(source, sourceItemId) {
  return `${source.feedUrl}::${String(sourceItemId)}`;
}

function isHttpUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function migrateStateItemIds(state, sources) {
  const previousVersion = state.version;
  const sourceByFeedUrl = new Map(
    sources
      .filter((source) => source?.id && source?.feedUrl)
      .map((source) => [source.feedUrl, source]),
  );
  const migratedItems = {};
  let migratedCount = 0;

  for (const [currentId, record] of Object.entries(state.items)) {
    const source =
      record?.source?.feedUrl && sourceByFeedUrl.get(record.source.feedUrl);
    const sourceItemId = record?.sourceItemId;
    const nextId =
      source && sourceItemId ? buildStateItemId(source, sourceItemId) : currentId;

    if (nextId !== currentId) {
      migratedCount += 1;
    }

    migratedItems[nextId] = migratedItems[nextId]
      ? mergeStateRecords(migratedItems[nextId], record, nextId)
      : {
          ...record,
          id: nextId,
        };
  }

  state.items = migratedItems;

  // v2→v3: ensure top-level events and weeklyDigest maps exist
  if (!state.events || typeof state.events !== "object" || Array.isArray(state.events)) {
    state.events = {};
  }
  if (!state.sources || typeof state.sources !== "object" || Array.isArray(state.sources)) {
    state.sources = {};
  }
  if (!state.weeklyDigest || typeof state.weeklyDigest !== "object" || Array.isArray(state.weeklyDigest)) {
    state.weeklyDigest = {};
  }

  if (migratedCount > 0 || previousVersion !== CURRENT_STATE_VERSION) {
    state.version = CURRENT_STATE_VERSION;
  }

  return {
    changed: migratedCount > 0 || previousVersion !== CURRENT_STATE_VERSION,
    migratedCount,
  };
}

export function initializeNewFeedSources(state, sources, initializedAt) {
  const newlyInitialized = new Set();
  state.sources = state.sources && typeof state.sources === "object" ? state.sources : {};
  const knownSourceIds = new Set(
    Object.values(state.items || {})
      .map((item) => item?.source?.id)
      .filter(Boolean),
  );

  for (const source of sources) {
    if (state.sources[source.id]) continue;
    if (knownSourceIds.has(source.id)) {
      state.sources[source.id] = {
        initializedAt: state.initializedAt || initializedAt,
        feedUrl: source.feedUrl,
      };
      continue;
    }
    state.sources[source.id] = {
      initializedAt,
      feedUrl: source.feedUrl,
    };
    newlyInitialized.add(source.id);
  }

  return newlyInitialized;
}

export function upsertStateRecord(state, item, seenAt, options = {}) {
  const legacyId = buildLegacyStateItemId(item.source, item.sourceItemId);
  const existing = state.items[item.id] || state.items[legacyId];
  const record = {
    id: item.id,
    sourceItemId: item.sourceItemId,
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
    summary: item.summary || null,
    imageUrl: item.imageUrl || null,
    source: item.source,
    firstSeenAt: existing?.firstSeenAt || seenAt,
    lastSeenAt: seenAt,
    suppressed:
      typeof existing?.suppressed === "boolean"
        ? existing.suppressed
        : Boolean(options.suppressed),
    channels:
      existing?.channels && typeof existing.channels === "object"
        ? existing.channels
        : {},
  };

  state.items[item.id] = record;
  if (legacyId !== item.id) {
    delete state.items[legacyId];
  }
  return record;
}

export function buildMessage(item) {
  return [`New community post from ${item.source.name}`, item.title, item.link].join(
    "\n",
  );
}

export function buildDiscordPayload(item) {
  const embed = {
    title: item.title,
    url: item.link,
    timestamp: item.publishedAt,
    author: {
      name: item.source.name,
      url: item.source.siteUrl,
    },
    footer: {
      text: item.source.siteUrl,
    },
  };

  if (item.summary) {
    embed.description = item.summary;
  }

  if (isHttpUrl(item.imageUrl)) {
    embed.image = {
      url: item.imageUrl,
    };
  }

  return {
    content: `New community post from **${item.source.name}**`,
    embeds: [embed],
  };
}
