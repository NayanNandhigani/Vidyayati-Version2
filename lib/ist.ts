// Indian Standard Time helpers. The server (Vercel) runs in UTC, so any
// "today", greeting, due-date or timestamp logic that used the server's own
// clock was up to 5½ hours off. All date logic goes through these instead.
//
// Convention for date-only values (attendance date, due date, DOB, exam
// date): they're stored as UTC midnight of the calendar date, i.e.
// new Date("2026-09-29") — so a "YYYY-MM-DD" string is the natural way to
// compare them with today's IST date.

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30, no daylight saving

/** The IST calendar date of `at` as "YYYY-MM-DD". */
export function istDateString(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date in India as "YYYY-MM-DD". */
export function todayIST(now: Date = new Date()): string {
  return istDateString(now);
}

/** Today's IST date as a date-only value (UTC midnight), for comparing with stored date columns. */
export function todayISTDate(now: Date = new Date()): Date {
  return new Date(`${todayIST(now)}T00:00:00.000Z`);
}

/** The calendar date of a stored date-only value as "YYYY-MM-DD" (it's UTC midnight, so the UTC date is the date). */
export function dateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" into a stored date-only value, or null if it isn't a real date. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || dateOnlyString(d) !== value ? null : d;
}

/** True when a "YYYY-MM-DD" date is after today in India. */
export function isFutureDateIST(value: string, now: Date = new Date()): boolean {
  return value > todayIST(now);
}

/** Whole days from today (IST) to a stored date-only value; negative when it's in the past. */
export function daysFromTodayIST(d: Date, now: Date = new Date()): number {
  return Math.round((new Date(`${dateOnlyString(d)}T00:00:00.000Z`).getTime() - todayISTDate(now).getTime()) / 86_400_000);
}

/** The hour of day (0–23) in India. */
export function istHour(now: Date = new Date()): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** "Good morning" before 12:00 IST, "Good afternoon" before 17:00, otherwise "Good evening". */
export function greetingIST(now: Date = new Date()): string {
  const h = istHour(now);
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Age in whole years on today's IST date, from a "YYYY-MM-DD" date of birth. */
export function ageOnIST(dob: string, now: Date = new Date()): number {
  const today = todayIST(now);
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, day: "2-digit", month: "short", year: "numeric" });
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const LONG_DATE_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** A moment in time (e.g. an audit timestamp) shown in IST: "29 Sept 2026, 7:05 pm". */
export function formatDateTimeIST(d: Date): string {
  return DATE_TIME_FMT.format(d);
}

/** A moment in time shown as its IST calendar date: "29 Sept 2026". */
export function formatDateIST(d: Date): string {
  return DATE_FMT.format(d);
}

/** Today's date in IST written out: "Thursday, 1 October 2026". */
export function formatLongDateIST(d: Date = new Date()): string {
  return LONG_DATE_FMT.format(d);
}
