// Server-side parsing of the School settings "General" form (QA BUG-27):
// India-specific fields with the formats schools actually use.

import { INDIAN_STATES_AND_UTS, SCHOOL_BOARDS, isIndianState, isValidPinCode, isValidUdiseCode } from "./indian";
import { normalizeIndianMobile, validateOptionalEmail } from "./validation";

export type SchoolGeneralValues = {
  name: string;
  city: string;
  state: string;
  postalCode: string;
  affiliationBoard: string;
  affiliationNumber: string;
  udiseCode: string;
  phone: string;
  email: string;
};

export type SchoolGeneralData = {
  name: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  affiliationBoard: string | null;
  affiliationNumber: string | null;
  udiseCode: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * A school phone is a mobile (stored as its 10 digits) or a landline with
 * its STD code, e.g. "040 2345 6789" (stored as "04023456789"). Null when
 * it's neither.
 */
export function normalizeSchoolPhone(value: string): string | null {
  const mobile = normalizeIndianMobile(value);
  if (mobile) return mobile;
  const compact = value.trim().replace(/[\s\-()]/g, "").replace(/^\+91/, "0");
  return /^0\d{9,10}$/.test(compact) ? compact : null;
}

/** The state to show in the dropdown: a stored value matched case-insensitively to the official list, else as stored. */
export function matchIndianState(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase() === v.toLowerCase()) ?? v;
}

export function parseSchoolGeneral(
  input: Record<string, string>,
  current: { state: string | null },
): { data: SchoolGeneralData; values: SchoolGeneralValues; fieldErrors?: undefined } | { fieldErrors: Partial<Record<keyof SchoolGeneralValues, string>>; values: SchoolGeneralValues; data?: undefined } {
  const get = (k: keyof SchoolGeneralValues) => (input[k] ?? "").trim();
  const values: SchoolGeneralValues = {
    name: get("name"),
    city: get("city"),
    state: get("state"),
    postalCode: get("postalCode"),
    affiliationBoard: get("affiliationBoard"),
    affiliationNumber: get("affiliationNumber"),
    udiseCode: get("udiseCode").replace(/\s/g, ""),
    phone: get("phone"),
    email: get("email").toLowerCase(),
  };
  const errors: Partial<Record<keyof SchoolGeneralValues, string>> = {};

  if (!values.name) errors.name = "School name is required.";
  else if (values.name.length > 150) errors.name = "School name must be 150 characters or fewer.";
  if (values.city.length > 80) errors.city = "City must be 80 characters or fewer.";
  // A state saved before the dropdown existed (free text) can be kept as is.
  if (values.state && !isIndianState(values.state) && values.state !== (current.state ?? "").trim()) errors.state = "Choose a state or union territory from the list.";
  if (values.postalCode && !isValidPinCode(values.postalCode)) errors.postalCode = "PIN code must be 6 digits and can't start with 0.";
  if (values.affiliationBoard && !(SCHOOL_BOARDS as readonly string[]).includes(values.affiliationBoard)) errors.affiliationBoard = "Choose a board from the list.";
  if (values.affiliationNumber.length > 40) errors.affiliationNumber = "Affiliation number must be 40 characters or fewer.";
  if (values.udiseCode && !isValidUdiseCode(values.udiseCode)) errors.udiseCode = "UDISE code must be exactly 11 digits.";
  const phone = values.phone ? normalizeSchoolPhone(values.phone) : null;
  if (values.phone && !phone) errors.phone = "Enter a 10-digit mobile number, or a landline with its STD code (e.g. 040 2345 6789).";
  const emailError = validateOptionalEmail(values.email, "School email");
  if (emailError) errors.email = emailError;

  if (Object.keys(errors).length > 0) return { fieldErrors: errors, values };

  const orNull = (v: string) => v || null;
  return {
    values,
    data: {
      name: values.name,
      city: orNull(values.city),
      state: orNull(values.state),
      postalCode: orNull(values.postalCode),
      affiliationBoard: orNull(values.affiliationBoard),
      affiliationNumber: orNull(values.affiliationNumber),
      udiseCode: orNull(values.udiseCode),
      phone,
      email: orNull(values.email),
    },
  };
}
