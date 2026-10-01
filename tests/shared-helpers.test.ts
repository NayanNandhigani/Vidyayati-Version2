import { describe, expect, it } from "vitest";
import { formatINR, formatINRCompact } from "@/lib/format";
import { ageOnIST, greetingIST, isFutureDateIST, parseDateOnly, todayIST, daysFromTodayIST } from "@/lib/ist";
import { classAgeWarning, cleanPhone, normalizeIndianMobile, parseMoney, validateDob } from "@/lib/validation";
import { friendlyError } from "@/lib/friendly-error";
import { UserError, runAction, GENERIC_ERROR } from "@/lib/action-result";

describe("formatINR", () => {
  it("uses lakh grouping", () => {
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(12345678)).toBe("₹1,23,45,678");
    expect(formatINR(999)).toBe("₹999");
  });
  it("puts the minus sign before the symbol", () => expect(formatINR(-32600)).toBe("-₹32,600"));
  it("shows paise only when present", () => {
    expect(formatINR(1234.5)).toBe("₹1,234.5");
    expect(formatINR(0)).toBe("₹0");
  });
  it("accepts Decimal-like and empty values", () => {
    expect(formatINR({ toString: () => "2500.00" })).toBe("₹2,500");
    expect(formatINR(null)).toBe("₹0");
  });
  it("compact form for chart axes", () => {
    expect(formatINRCompact(450000)).toBe("₹4.5L");
    expect(formatINRCompact(-32600)).toBe("-₹32.6K");
  });
});

describe("IST dates", () => {
  // 29 Sep 2026 19:00 IST = 13:30 UTC; 30 Sep 2026 01:00 IST = 29 Sep 19:30 UTC
  const evening = new Date("2026-09-29T13:30:00Z");
  const afterMidnightIST = new Date("2026-09-29T19:30:00Z");
  it("today follows India, not the server", () => {
    expect(todayIST(evening)).toBe("2026-09-29");
    expect(todayIST(afterMidnightIST)).toBe("2026-09-30");
  });
  it("greets by IST hour (7 pm is evening)", () => {
    expect(greetingIST(evening)).toBe("Good evening");
    expect(greetingIST(new Date("2026-09-29T03:00:00Z"))).toBe("Good morning"); // 8:30 am IST
    expect(greetingIST(new Date("2026-09-29T08:00:00Z"))).toBe("Good afternoon"); // 1:30 pm IST
  });
  it("future dates", () => {
    expect(isFutureDateIST("2026-12-02", evening)).toBe(true);
    expect(isFutureDateIST("2026-09-29", evening)).toBe(false);
    expect(isFutureDateIST("2026-09-30", afterMidnightIST)).toBe(false);
  });
  it("parses only real dates", () => {
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("abc")).toBeNull();
    expect(parseDateOnly("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("days from today", () => expect(daysFromTodayIST(new Date("2026-09-01T00:00:00Z"), evening)).toBe(-28));
  it("age", () => expect(ageOnIST("2016-09-30", evening)).toBe(9));
});

describe("Indian mobile numbers", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("accepts %s", (input, clean) => expect(normalizeIndianMobile(input)).toBe(clean));
  it.each(["abc", "123456789012", "0412345678", "+61412345678", "5876543210", "987654321", ""])("rejects %s", (input) => expect(normalizeIndianMobile(input)).toBeNull());
  it("cleanPhone handles optional and required", () => {
    expect(cleanPhone("", "Mobile")).toEqual({ value: null });
    expect(cleanPhone("", "Mobile", { required: true }).error).toMatch(/required/);
    expect(cleanPhone("0412 345 678", "Mobile").error).toMatch(/10-digit Indian mobile/);
  });
});

describe("money and DOB", () => {
  it("rejects negative amounts with a reason", () => {
    expect(parseMoney("-500", "Estimated cost").error).toMatch(/can't be negative/);
    expect(parseMoney("1,500", "Fee").value).toBe(1500);
    expect(parseMoney("abc", "Fee").error).toMatch(/must be a number/);
    expect(parseMoney("0", "Payment", { allowZero: false }).error).toMatch(/more than/);
    expect(parseMoney("", "Fee", { required: true }).error).toMatch(/required/);
  });
  it("rejects a future date of birth", () => expect(validateDob("2099-01-01")).toMatch(/future/));
  it("warns when age doesn't fit the class", () => {
    expect(classAgeWarning("2000-01-01", "5")).toMatch(/outside the usual school age/);
    expect(classAgeWarning(`${Number(todayIST().slice(0, 4)) - 10}-06-01`, "5")).toBeNull();
  });
});

describe("friendly errors", () => {
  it("hides Next.js production error text", () => {
    expect(friendlyError(new Error("An error occurred in the Server Components render. The specific message is omitted"))).not.toMatch(/Server Components/);
    expect(friendlyError(new Error("This vehicle is full (40/40 seats)."))).toBe("This vehicle is full (40/40 seats).");
  });
  it("runAction returns UserError messages and hides unexpected ones", async () => {
    expect(await runAction(async () => { throw new UserError("Bus full"); })).toEqual({ error: "Bus full", fieldErrors: undefined });
    const quiet = console.error; console.error = () => {};
    expect((await runAction(async () => { throw new Error("connection refused at 10.0.0.1"); })).error).toBe(GENERIC_ERROR);
    console.error = quiet;
    expect(await runAction(async () => ({ id: "x" }))).toEqual({ ok: true, id: "x" });
    expect(await runAction(async () => undefined)).toEqual({ ok: true });
    expect(await runAction(async () => ({ error: "Nope" }))).toEqual({ error: "Nope" });
  });
});

import { formatIST } from "@/lib/ist";

describe("formatIST (deterministic IST formatting)", () => {
  const at = new Date("2026-09-29T13:35:00Z"); // 7:05 pm IST
  it("formats dates in IST regardless of the machine's timezone", () => {
    expect(formatIST(at, { day: "2-digit", month: "short", year: "numeric" })).toBe("29 Sep 2026");
    expect(formatIST(at, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })).toBe("Tuesday, 29 September 2026");
    expect(formatIST(at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })).toBe("29 Sep, 7:05 pm");
    expect(formatIST(at, { weekday: "short" })).toBe("Tue");
    expect(formatIST(at, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })).toBe("29/09/2026, 7:05 pm");
  });
  it("rolls over to the next IST day late in the UTC evening", () => {
    expect(formatIST("2026-09-29T19:00:00Z", { day: "2-digit", month: "short" })).toBe("30 Sep");
  });
  it("keeps date-only values (UTC midnight) on their own day", () => {
    expect(formatIST("2026-09-29T00:00:00.000Z", { day: "2-digit", month: "short" })).toBe("29 Sep");
  });
  it("leaves clock times unshifted and handles empty values", () => {
    expect(formatIST(new Date("1970-01-01T07:30:00Z"), { hour: "2-digit", minute: "2-digit" }, { clock: true })).toBe("7:30 am");
    expect(formatIST(null, { day: "2-digit" })).toBe("—");
  });
});
