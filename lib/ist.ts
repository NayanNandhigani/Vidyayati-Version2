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

/** The instant an IST calendar day ("2026-09-29") begins. */
export function istDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}

// ---------------------------------------------------------------------------
// formatIST: date/time text that's identical on the server and in every
// browser. toLocaleDateString("en-IN", …) depends on each runtime's ICU
// data and timezone — Node prints "Tuesday, 29 Sept 2026" where Chromium
// prints "Tuesday 29 Sept, 2026", and a browser outside India shifts the
// day — so a client component rendered on the server and hydrated in the
// browser disagreed (React error #418 on Homework). This does the IST
// arithmetic itself (UTC+5:30, India has no daylight saving) and always
// writes the same shape: "Tuesday, 29 Sep 2026, 7:05 pm".

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type FormatISTOptions = {
  weekday?: "long" | "short";
  day?: "numeric" | "2-digit";
  month?: "short" | "long" | "2-digit";
  year?: "numeric";
  hour?: "numeric" | "2-digit";
  minute?: "2-digit";
  hour12?: boolean;
};

/**
 * Formats a moment in IST. Pass `clock: true` for a time-of-day column
 * (Postgres TIME, e.g. a bus stop's pickup time) — those hold the wall-clock
 * time as UTC and must not be shifted.
 */
export function formatIST(value: Date | string | number | null | undefined, opts: FormatISTOptions, { clock = false }: { clock?: boolean } = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(clock ? t : t + IST_OFFSET_MS); // read with getUTC* below
  const pad = (n: number) => String(n).padStart(2, "0");

  const dateParts: string[] = [];
  if (opts.day) dateParts.push(opts.day === "2-digit" ? pad(d.getUTCDate()) : String(d.getUTCDate()));
  if (opts.month === "2-digit") {
    // Numeric style: 29/09/2026
    const numeric = [opts.day ? dateParts.pop()! : null, pad(d.getUTCMonth() + 1), opts.year ? String(d.getUTCFullYear()) : null].filter(Boolean).join("/");
    dateParts.push(numeric);
  } else {
    if (opts.month) dateParts.push((opts.month === "long" ? MONTHS_LONG : MONTHS_SHORT)[d.getUTCMonth()]!);
    if (opts.year) dateParts.push(String(d.getUTCFullYear()));
  }

  let text = dateParts.join(" ");
  if (opts.weekday) {
    const wd = WEEKDAYS_LONG[d.getUTCDay()]!;
    const name = opts.weekday === "short" ? wd.slice(0, 3) : wd;
    text = text ? `${name}, ${text}` : name;
  }
  if (opts.hour || opts.minute) {
    const h24 = d.getUTCHours();
    const mm = pad(d.getUTCMinutes());
    const time = opts.hour12 === false ? `${pad(h24)}:${mm}` : `${h24 % 12 || 12}:${mm} ${h24 < 12 ? "am" : "pm"}`;
    text = text ? `${text}, ${time}` : time;
  }
  return text;
}
