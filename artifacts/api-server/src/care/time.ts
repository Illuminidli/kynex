/**
 * Clinic time. QI Spine is in India: every "day", working hour and booking is in India time
 * (UTC+5:30, no daylight saving), whatever time zone the server runs in.
 */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The clock, replaceable in tests. */
export const clock = { now: () => new Date() };

/** "YYYY-MM-DD" of a moment, in India time. */
export const dayOf = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
export const today = () => dayOf(clock.now());
/** 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** The moment a clinic day reaches `minute` minutes after midnight. */
export const atMinute = (day: string, minute: number) => new Date(Date.parse(`${day}T00:00:00Z`) + minute * 60_000 - IST_OFFSET_MS);
/** Minutes after midnight, India time. */
export function minuteOf(d: Date): number {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
}
/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 24 Nov, 10:30" for the activity feed (India time). */
export function describeTime(d: Date): string {
  const day = dayOf(d);
  const m = minuteOf(d);
  const [, mo, dd] = day.split("-").map(Number);
  return `${WEEKDAY[weekdayOf(day)]} ${dd} ${MONTH[(mo ?? 1) - 1]}, ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function describeDay(day: string): string {
  const [, mo, dd] = day.split("-").map(Number);
  return `${WEEKDAY[weekdayOf(day)]} ${dd} ${MONTH[(mo ?? 1) - 1]}`;
}
