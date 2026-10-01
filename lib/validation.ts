import { z } from "zod";
import { ageOnIST, isFutureDateIST, parseDateOnly } from "./ist";

// Shared field-level validators for server actions — plain functions
// rather than a zod schema-per-form (the QA fix list's eventual ask) so
// this can land incrementally without a wholesale rewrite of every form
// action; each returns an error string or null so callers can compose
// them into their own { error } return shape. newPasswordSchema below
// predates these and is the one existing exception to that (a real zod
// schema, kept as-is).

export const newPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    username: z.string(),
  })
  .refine((data) => data.newPassword.toLowerCase() !== data.username.toLowerCase(), {
    message: "Password can't be the same as your username.",
    path: ["newPassword"],
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Indian mobile numbers: 10 digits starting with 6–9, optionally written
 * with +91, 91 or a leading 0, and with spaces, dashes or brackets. Returns
 * the clean 10-digit number to store, or null if it isn't a valid mobile.
 */
export function normalizeIndianMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s\-()]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits = compact.replace(/^\+/, "");
  if (compact.startsWith("+")) {
    if (!digits.startsWith("91")) return null; // another country's code
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const PHONE_MESSAGE = "must be a 10-digit Indian mobile number starting with 6, 7, 8 or 9 (you can add +91 or 0 in front).";

export function validatePhone(value: string, label = "Phone number"): string | null {
  return normalizeIndianMobile(value) ? null : `${label} ${PHONE_MESSAGE}`;
}

/** Same as validatePhone but treats an empty string as valid (for optional phone fields). */
export function validateOptionalPhone(value: string, label = "Phone number"): string | null {
  if (!value.trim()) return null;
  return validatePhone(value, label);
}

/**
 * Validates and cleans a phone field in one step: { value } is what to
 * store (the 10-digit number, or null when optional and empty), { error }
 * the message to show.
 */
export function cleanPhone(value: string | null | undefined, label = "Phone number", opts: { required?: boolean } = {}): { value: string | null; error?: undefined } | { error: string; value?: undefined } {
  const raw = (value ?? "").trim();
  if (!raw) return opts.required ? { error: `${label} is required.` } : { value: null };
  const clean = normalizeIndianMobile(raw);
  return clean ? { value: clean } : { error: `${label} ${PHONE_MESSAGE}` };
}

/**
 * Money amounts entered by a person are never negative: Accounts takes the
 * sign from its Income/Expense toggle, and costs, fees and fines are
 * amounts, not directions. Returns the number, or an error message.
 */
export function parseMoney(value: FormDataEntryValue | string | number | null | undefined, label = "Amount", opts: { required?: boolean; allowZero?: boolean } = {}): { value: number | null; error?: undefined } | { error: string; value?: undefined } {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/[,₹\s]/g, "") : "";
  if (!raw) return opts.required ? { error: `${label} is required.` } : { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
  if (n < 0) return { error: `${label} can't be negative. Enter the amount without a minus sign.` };
  if (n === 0 && opts.allowZero === false) return { error: `${label} must be more than ₹0.` };
  if (Math.round(n * 100) !== n * 100) return { error: `${label} can have at most 2 decimal places.` };
  return { value: n };
}

export function validateEmail(value: string, label = "Email"): string | null {
  if (!EMAIL_RE.test(value.trim())) return `${label} isn't a valid email address.`;
  return null;
}

/** Same as validateEmail but treats an empty string as valid (for optional email fields). */
export function validateOptionalEmail(value: string, label = "Email"): string | null {
  if (!value.trim()) return null;
  return validateEmail(value, label);
}

/**
 * A date of birth can't be in the future (IST) and must give an age within
 * the bounds — defaults (2-25) suit a student; pass wider bounds for staff.
 * Treats an empty string as valid (DOB is optional almost everywhere).
 */
export function validateDob(value: string, minAge = 2, maxAge = 25, label = "Date of birth"): string | null {
  if (!value) return null;
  if (!parseDateOnly(value)) return `${label} isn't a valid date.`;
  if (isFutureDateIST(value)) return `${label} can't be in the future.`;
  const age = ageOnIST(value);
  if (age < minAge || age > maxAge) return `${label} gives an age of ${age}, which should be between ${minAge} and ${maxAge}.`;
  return null;
}

/** Soft check for a student's age against their class — a warning to show, not a reason to block. Grade "1" suits ages 5–7, so the expected age is grade + 5, ± 2 years; nursery/LKG/UKG suit 3–6. */
export function classAgeWarning(dob: string, grade: string): string | null {
  if (!dob || !parseDateOnly(dob)) return null;
  const age = ageOnIST(dob);
  if (age < 3 || age > 20) return `This student would be ${age}, which is outside the usual school age range (3–20). Please double-check the date of birth.`;
  const g = Number.parseInt(grade, 10);
  if (Number.isFinite(g)) {
    const expected = g + 5;
    if (Math.abs(age - expected) > 2) return `This student would be ${age}, which is unusual for Class ${grade} (usually about ${expected}). Please double-check the date of birth and class.`;
  } else if (/nur|lkg|ukg|pre|kg/i.test(grade) && (age < 2 || age > 7)) {
    return `This student would be ${age}, which is unusual for ${grade}. Please double-check the date of birth and class.`;
  }
  return null;
}
