import { daysFromTodayIST, formatIST } from "./ist";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Indian money format used everywhere money is shown: ₹ with lakh grouping
 * (₹1,00,000), paise only when there are any (₹1,234.50), and the minus
 * sign before the symbol (-₹32,600, never ₹-32,600). Accepts Prisma
 * Decimals via Number().
 */
export function formatINR(amount: number | string | { toString(): string } | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${INR.format(Math.abs(n))}`;
}

/** Short form for tight spaces such as chart axes: ₹4.5L, ₹1.2Cr, -₹32.6K. Use formatINR for anything a person reads as a figure. */
export function formatINRCompact(amount: number): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${+(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${sign}₹${+(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${+(a / 1e3).toFixed(1)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** "Thursday, 1 October 2026" — in IST, so "today" in a page heading is India's today whatever the server's time zone. */
export function formatDate(date: Date): string {
  return formatIST(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Whole calendar days from today (IST) to a date — 0 when it's today. */
export function daysUntil(date: Date): number {
  return daysFromTodayIST(date);
}

export function studentName(s: { firstName: string; surname: string }): string {
  return `${s.firstName} ${s.surname}`;
}
