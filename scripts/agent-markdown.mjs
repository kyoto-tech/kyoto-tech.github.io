import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const links = {
  meetup: "https://www.meetup.com/kyoto-tech-meetup/",
  discord: "https://discord.gg/mXFWEHDKeu",
  github: "https://github.com/kyoto-tech",
  linkedin: "https://www.linkedin.com/company/kyoto-tech-meetup/",
  contact: "https://forms.gle/NPtc1G1vM9jGBYhp6",
};

function escapeMarkdown(value) {
  return String(value ?? "").replace(/[\\`*_[\]]/g, "\\$&").trim();
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function eventMapUrl(venue) {
  const parts = [venue?.name, venue?.address, venue?.city, venue?.state, venue?.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

function formatDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date to be confirmed";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function formatEvent(event, locale) {
  const eventUrl = safeHttpUrl(event.link) ?? links.meetup;
  const mapUrl = eventMapUrl(event.venue);
  const venue = event.venue?.name || event.venue?.city || "Kyoto";
  const attendance = Number.isFinite(event.goingCount) ? ` · ${event.goingCount} going` : "";
  const map = mapUrl ? ` · [Open in Maps](${mapUrl})` : "";
  return `- **[${escapeMarkdown(event.title)}](${eventUrl})** — ${formatDate(event.start, locale)} — ${escapeMarkdown(venue)}${attendance}${map}`;
}

function validEvents(snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  return events
    .filter((event) => event && typeof event === "object")
    .filter((event) => safeHttpUrl(event.link) && !Number.isNaN(new Date(event.start).valueOf()))
    .sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf());
}

function validFeedItems(snapshot) {
  const feeds = Array.isArray(snapshot?.feeds) ? snapshot.feeds : [];
  return feeds
    .flatMap((feed) => (Array.isArray(feed.items) ? feed.items : []).map((item) => ({ ...item, sourceName: feed.name })))
    .filter((item) => item && safeHttpUrl(item.link))
    .sort((a, b) => new Date(b.publishedAt).valueOf() - new Date(a.publishedAt).valueOf());
}

export function buildAgentMarkdown({ eventsSnapshot, feedSnapshot, locale = "en-US", now = new Date() }) {
  const events = validEvents(eventsSnapshot).filter((event) => new Date(event.start).valueOf() >= now.valueOf());
  const items = validFeedItems(feedSnapshot).slice(0, 8);
  const japanese = locale === "ja-JP";
  const eventHeading = japanese ? "## 次回・今後のミートアップ" : "## Next and upcoming meetups";
  const feedHeading = japanese ? "## メンバーが発信していること" : "## What members are publishing";
  const eventEmpty = japanese
    ? "現在予定されているイベントはありません。最新情報はMeetupページをご確認ください。"
    : "There are no upcoming events in the current snapshot. Check Meetup for the latest information.";
  const eventLines = events.length > 0 ? events.slice(0, 8).map((event) => formatEvent(event, locale)).join("\n") : eventEmpty;
  const feedLines = items.length > 0
    ? items.map((item) => `- **[${escapeMarkdown(item.title)}](${item.link})** — ${escapeMarkdown(item.sourceName)}${item.publishedAt ? ` · ${formatDate(item.publishedAt, locale)}` : ""}`).join("\n")
    : japanese ? "現在、掲載されているメンバー記事はありません。" : "There are no published member items in the current snapshot.";
  const generatedAt = eventsSnapshot?.generatedAt || feedSnapshot?.generatedAt || "unknown";
  const intro = japanese
    ? "Kyoto Tech Meetupは、京都で英語・日本語を使いながら、会話とハンズオンのものづくりを楽しむコミュニティです。初心者、地元の方、旅行者を歓迎しています。"
    : "Kyoto Tech Meetup is a community in Kyoto for conversation and hands-on building in English and Japanese. Newcomers, locals, nomads, and travelers are welcome.";
  const linksHeading = japanese ? "## コミュニティリンク" : "## Community links";
  const linksLines = japanese
    ? `- [Meetupで参加する](${links.meetup})\n- [Discordに参加する](${links.discord})\n- [GitHubを見る](${links.github})\n- [LinkedInでつながる](${links.linkedin})\n- [問い合わせる](${links.contact})`
    : `- [Join on Meetup](${links.meetup})\n- [Join Discord](${links.discord})\n- [View GitHub](${links.github})\n- [Network on LinkedIn](${links.linkedin})\n- [Contact the organizers](${links.contact})`;
  return `# Kyoto Tech Meetup\n\n${intro}\n\n${eventHeading}\n\n${eventLines}\n\n${feedHeading}\n\n${feedLines}\n\n${linksHeading}\n\n${linksLines}\n\n---\n\n${japanese ? "この情報のイベントスナップショット" : "Event snapshot"}: ${generatedAt}\n`;
}

export async function writeAgentMarkdown({ eventsPath = path.join(ROOT, "src/data/meetup-events.json"), feedsPath = path.join(ROOT, "src/data/composite-feed.json"), outputDirectory = PUBLIC_DIR } = {}) {
  const [eventsSnapshot, feedSnapshot] = await Promise.all([
    fs.readFile(eventsPath, "utf8").then(JSON.parse),
    fs.readFile(feedsPath, "utf8").then(JSON.parse),
  ]);
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, "agent-home.en.md"), buildAgentMarkdown({ eventsSnapshot, feedSnapshot, locale: "en-US" })),
    fs.writeFile(path.join(outputDirectory, "agent-home.ja.md"), buildAgentMarkdown({ eventsSnapshot, feedSnapshot, locale: "ja-JP" })),
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) await writeAgentMarkdown();
