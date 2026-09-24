import { z } from "zod";

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

const PHONE_RE = /^\+?\d{8,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePhone(value: string, label = "Phone number"): string | null {
  const trimmed = value.trim();
  if (!PHONE_RE.test(trimmed)) return `${label} must be 8-15 digits, with an optional + country code.`;
  return null;
}

/** Same as validatePhone but treats an empty string as valid (for optional phone fields). */
export function validateOptionalPhone(value: string, label = "Phone number"): string | null {
  if (!value.trim()) return null;
  return validatePhone(value, label);
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
