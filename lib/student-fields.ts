import type { Gender, StudentCategory } from "@prisma/client";
import { cleanPhone, validateDob, validateOptionalEmail } from "./validation";
import { isFutureDateIST, parseDateOnly } from "./ist";
import { isIndianState, isValidPinCode, normalizeAadhaar, normalizeApaarId, BLOOD_GROUPS, STUDENT_CATEGORIES } from "./indian";

// One definition of a student's editable details, shared by "Add student"
// and the profile's "Edit details" so both validate and store identically.

export type StudentDetails = {
  firstName: string;
  surname: string;
  dob: string; // "YYYY-MM-DD" or ""
  gender: Gender | "";
  fatherName: string;
  motherName: string;
  guardianName: string;
  primaryMobile: string;
  email: string;
  address: string;
  state: string;
  pinCode: string;
  aadhaarNumber: string; // on edit, "" means "keep the number already on file"
  apaarId: string;
  category: StudentCategory | "";
  religion: string;
  bloodGroup: string;
  previousSchoolName: string;
  admissionDate: string; // "YYYY-MM-DD" or ""
  rteQuota: boolean;
  medicalNotes: string;
  rollNumber: string;
};

export type StudentDetailErrors = Partial<Record<keyof StudentDetails | "admissionNo" | "classId", string>>;

export const EMPTY_STUDENT_DETAILS: StudentDetails = {
  firstName: "",
  surname: "",
  dob: "",
  gender: "",
  fatherName: "",
  motherName: "",
  guardianName: "",
  primaryMobile: "",
  email: "",
  address: "",
  state: "",
  pinCode: "",
  aadhaarNumber: "",
  apaarId: "",
  category: "",
  religion: "",
  bloodGroup: "",
  previousSchoolName: "",
  admissionDate: "",
  rteQuota: false,
  medicalNotes: "",
  rollNumber: "",
};

const NAME_MAX = 80;

/**
 * Validates a student's details and returns either per-field messages or
 * the column values to store. `keepAadhaarWhenEmpty` is for edits, where
 * the existing Aadhaar is never sent back to the browser.
 */
export function parseStudentDetails(f: StudentDetails, opts: { keepAadhaarWhenEmpty?: boolean } = {}) {
  const errors: StudentDetailErrors = {};
  const t = (v: string) => v.trim();

  if (!t(f.firstName)) errors.firstName = "Enter the first name.";
  else if (t(f.firstName).length > NAME_MAX) errors.firstName = `First name is too long (${NAME_MAX} characters at most).`;
  if (!t(f.surname)) errors.surname = "Enter the surname.";
  else if (t(f.surname).length > NAME_MAX) errors.surname = `Surname is too long (${NAME_MAX} characters at most).`;

  const dobError = f.dob ? validateDob(f.dob, 2, 25) : null;
  if (dobError) errors.dob = dobError;
  if (f.gender && !["MALE", "FEMALE", "OTHER"].includes(f.gender)) errors.gender = "Pick a gender from the list.";

  const mobile = cleanPhone(f.primaryMobile, "Primary mobile");
  if (mobile.error) errors.primaryMobile = mobile.error;
  const emailError = validateOptionalEmail(f.email);
  if (emailError) errors.email = emailError;

  if (t(f.state) && !isIndianState(t(f.state))) errors.state = "Pick a state or union territory from the list.";
  if (t(f.pinCode) && !isValidPinCode(f.pinCode)) errors.pinCode = "PIN code must be 6 digits and can't start with 0.";

  let aadhaar: string | null | undefined = undefined; // undefined = leave unchanged
  if (t(f.aadhaarNumber)) {
    aadhaar = normalizeAadhaar(f.aadhaarNumber);
    if (!aadhaar) errors.aadhaarNumber = "That isn't a valid Aadhaar number. It has 12 digits and doesn't start with 0 or 1.";
  } else if (!opts.keepAadhaarWhenEmpty) {
    aadhaar = null;
  }

  let apaar: string | null = null;
  if (t(f.apaarId)) {
    apaar = normalizeApaarId(f.apaarId);
    if (!apaar) errors.apaarId = "APAAR ID must be 12 digits.";
  }

  if (f.category && !STUDENT_CATEGORIES.some((c) => c.value === f.category)) errors.category = "Pick a category from the list.";
  if (t(f.bloodGroup) && !(BLOOD_GROUPS as readonly string[]).includes(t(f.bloodGroup))) errors.bloodGroup = "Pick a blood group from the list.";

  let admissionDate: Date | null = null;
  if (f.admissionDate) {
    admissionDate = parseDateOnly(f.admissionDate);
    if (!admissionDate) errors.admissionDate = "Admission date isn't a valid date.";
    else if (isFutureDateIST(f.admissionDate)) errors.admissionDate = "Admission date can't be in the future.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  const opt = (v: string) => t(v) || null;
  return {
    errors: null,
    data: {
      firstName: t(f.firstName),
      surname: t(f.surname),
      dob: parseDateOnly(f.dob),
      gender: (f.gender || null) as Gender | null,
      fatherName: opt(f.fatherName),
      motherName: opt(f.motherName),
      guardianName: opt(f.guardianName),
      primaryMobile: mobile.value ?? null,
      email: opt(f.email),
      address: opt(f.address),
      state: opt(f.state),
      pinCode: opt(f.pinCode),
      ...(aadhaar === undefined ? {} : { aadhaarNumber: aadhaar }),
      apaarId: apaar,
      category: (f.category || null) as StudentCategory | null,
      religion: opt(f.religion),
      bloodGroup: opt(f.bloodGroup),
      previousSchoolName: opt(f.previousSchoolName),
      admissionDate,
      rteQuota: !!f.rteQuota,
      medicalNotes: opt(f.medicalNotes),
    },
    rollNumber: opt(f.rollNumber),
  };
}
