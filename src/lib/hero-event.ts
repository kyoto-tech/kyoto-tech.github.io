import type { MeetupEvent } from "./meetup-events";

const TIME_ZONE = "Asia/Tokyo";
const IN_PROGRESS_GRACE_MS = 4 * 60 * 60 * 1000;

type HeroEventOptions = {
  fallbackUrl: string;
  lang: "en" | "ja";
  now?: Date;
};

type HeroEventState =
  | {
      kind: "empty";
      href: string;
    }
  | {
      kind: "event";
      dateLabel: string;
      href: string;
      isOngoing: boolean;
      startDateTime: string;
      timeLabel: string;
      title: string;
      venueName: string | null;
    };

function isOngoingEvent(event: MeetupEvent, now: Date): boolean {
  const startMs = new Date(event.start).valueOf();
  const nowMs = now.valueOf();
  const endMs = event.endTime
    ? new Date(event.endTime).valueOf()
    : startMs + IN_PROGRESS_GRACE_MS;

  return startMs <= nowMs && endMs >= nowMs;
}

export function getHeroEventState(
  event: MeetupEvent | null,
  { fallbackUrl, lang, now = new Date() }: HeroEventOptions,
): HeroEventState {
  if (!event) {
    return { kind: "empty", href: fallbackUrl };
  }

  const locale = lang === "ja" ? "ja-JP" : "en-US";
  const start = new Date(event.start);
  const end = event.endTime ? new Date(event.endTime) : null;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: lang === "ja" ? "long" : "short",
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    hour12: lang === "en",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
  const startTime = timeFormatter.format(start);
  const timeLabel = end
    ? `${startTime}–${timeFormatter.format(end)}`
    : startTime;

  return {
    kind: "event",
    dateLabel,
    href: event.link,
    isOngoing: isOngoingEvent(event, now),
    startDateTime: event.start,
    timeLabel,
    title: event.title,
    venueName: event.venue?.name?.trim() || null,
  };
}
