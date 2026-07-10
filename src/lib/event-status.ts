import type { MeetupEvent } from "./meetup-events";

export const IN_PROGRESS_GRACE_MS = 4 * 60 * 60 * 1000;

export function isEventTimeOngoing(
  start: string,
  endTime: string | null,
  now = new Date(),
  graceMs = IN_PROGRESS_GRACE_MS,
): boolean {
  const startMs = new Date(start).valueOf();
  const nowMs = now.valueOf();
  const explicitEndMs = endTime ? new Date(endTime).valueOf() : null;
  const endMs = explicitEndMs ?? startMs + graceMs;

  return (
    Number.isFinite(startMs) &&
    Number.isFinite(nowMs) &&
    Number.isFinite(endMs) &&
    startMs <= nowMs &&
    endMs >= nowMs
  );
}

export function isOngoingEvent(
  event: Pick<MeetupEvent, "start" | "endTime">,
  now = new Date(),
): boolean {
  return isEventTimeOngoing(event.start, event.endTime, now);
}
