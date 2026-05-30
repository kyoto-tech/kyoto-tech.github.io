import type { EventInput } from "@fullcalendar/core";
import type { EventType } from "./event-types";

type CalendarEvent = {
  title: string;
  link: string;
  start: string;
  endTime: string | null;
  eventType: EventType;
};

type CalendarRange = {
  start: string;
  end: string;
};

const daysInFiveWeeks = 35;
const mondayFirstDay = 1;

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function getFiveWeekCalendarRange(
  currentDate = new Date(),
  firstDay = mondayFirstDay,
): CalendarRange {
  const start = new Date(
    Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
    ),
  );
  const dayOffset = (start.getUTCDay() - firstDay + 7) % 7;
  start.setUTCDate(start.getUTCDate() - dayOffset);

  return {
    start: formatDateKey(start),
    end: formatDateKey(addDays(start, daysInFiveWeeks)),
  };
}

export function toFullCalendarEvents(events: CalendarEvent[]): EventInput[] {
  return events.map((event) => ({
    title: event.title,
    url: event.link,
    start: event.start,
    end: event.endTime ?? undefined,
    extendedProps: {
      eventType: event.eventType,
    },
    className: [`event-type-${event.eventType}`],
  }));
}
