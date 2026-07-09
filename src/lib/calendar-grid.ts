import type { MeetupEvent } from "./meetup-events";

const DAYS_IN_WEEK = 7;
const DAYS_IN_FIVE_WEEKS = 35;
const MONDAY = 1;
const DEFAULT_TIME_ZONE = "Asia/Tokyo";

type CalendarGridOptions = {
  currentDate?: Date;
  firstDay?: number;
  timeZone?: string;
};

type CalendarGridDay = {
  dateKey: string;
  dayNumber: number;
  events: MeetupEvent[];
  isRangeStart: boolean;
  isToday: boolean;
};

type CalendarRange = {
  end: string;
  start: string;
};

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function getFiveWeekCalendarRange(
  currentDate = new Date(),
  firstDay = MONDAY,
  timeZone = DEFAULT_TIME_ZONE,
): CalendarRange {
  const todayKey = formatDateKeyInTimeZone(currentDate, timeZone);
  const start = parseDateKey(todayKey);
  const dayOffset = (start.getUTCDay() - firstDay + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  start.setUTCDate(start.getUTCDate() - dayOffset);

  return {
    start: formatUtcDateKey(start),
    end: formatUtcDateKey(addDays(start, DAYS_IN_FIVE_WEEKS)),
  };
}

export function buildFiveWeekCalendar(
  events: readonly MeetupEvent[],
  {
    currentDate = new Date(),
    firstDay = MONDAY,
    timeZone = DEFAULT_TIME_ZONE,
  }: CalendarGridOptions = {},
): CalendarGridDay[][] {
  const range = getFiveWeekCalendarRange(currentDate, firstDay, timeZone);
  const start = parseDateKey(range.start);
  const todayKey = formatDateKeyInTimeZone(currentDate, timeZone);
  const eventsByDate = new Map<string, MeetupEvent[]>();

  events.forEach((event) => {
    const startDate = new Date(event.start);
    if (Number.isNaN(startDate.valueOf())) return;
    const dateKey = formatDateKeyInTimeZone(startDate, timeZone);
    const dateEvents = eventsByDate.get(dateKey) ?? [];
    dateEvents.push(event);
    eventsByDate.set(dateKey, dateEvents);
  });

  eventsByDate.forEach((dateEvents) => {
    dateEvents.sort((a, b) => {
      const startDifference = new Date(a.start).valueOf() - new Date(b.start).valueOf();
      return startDifference !== 0 ? startDifference : a.link.localeCompare(b.link);
    });
  });

  const days = Array.from({ length: DAYS_IN_FIVE_WEEKS }, (_, index) => {
    const date = addDays(start, index);
    const dateKey = formatUtcDateKey(date);

    return {
      dateKey,
      dayNumber: date.getUTCDate(),
      events: eventsByDate.get(dateKey) ?? [],
      isRangeStart: index === 0,
      isToday: dateKey === todayKey,
    };
  });

  return Array.from(
    { length: DAYS_IN_FIVE_WEEKS / DAYS_IN_WEEK },
    (_, weekIndex) =>
      days.slice(weekIndex * DAYS_IN_WEEK, (weekIndex + 1) * DAYS_IN_WEEK),
  );
}
