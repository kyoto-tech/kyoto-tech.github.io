const CURRENT_STATE_VERSION = 2;

export function defaultState() {
  return {
    version: CURRENT_STATE_VERSION,
    initializedAt: null,
    updatedAt: null,
    items: {},
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
  if (migratedCount > 0 || previousVersion !== CURRENT_STATE_VERSION) {
    state.version = CURRENT_STATE_VERSION;
  }

  return {
    changed: migratedCount > 0 || previousVersion !== CURRENT_STATE_VERSION,
    migratedCount,
  };
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

  return {
    content: `New community post from **${item.source.name}**`,
    embeds: [embed],
  };
}
