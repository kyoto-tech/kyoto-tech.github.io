export function defaultState() {
  return {
    version: 1,
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
    version: Number(parsed.version) || 1,
    initializedAt:
      typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    items:
      parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
        ? parsed.items
        : {},
  };
}

export function upsertStateRecord(state, item, seenAt, options = {}) {
  const existing = state.items[item.id];
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
