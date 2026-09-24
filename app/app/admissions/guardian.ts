import type { ScopedDb } from "@/lib/tenant-db";
import { findOrLinkGuardian } from "@/lib/guardian";

type EnquiryLike = {
  parentName: string | null;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  parentContact: string;
  email: string | null;
};

/**
 * Derives the guardian identity from an AdmissionEnquiry's captured
 * fields and hands off to the shared findOrLinkGuardian. Silently does
 * nothing if the enquiry never captured a parent name — the enquiry form
 * always requires a contact number, but "Parent name" itself is optional
 * at that stage.
 */
export async function createGuardianAccountForEnquiry(
  sdb: ScopedDb,
  enquiry: EnquiryLike,
  studentId: string
): Promise<{ setupToken: string; guardianName: string } | null> {
  const name = enquiry.parentName?.trim() || enquiry.fatherName?.trim() || enquiry.motherName?.trim() || enquiry.guardianName?.trim();
  if (!name) return null;

  const relation: "FATHER" | "MOTHER" | "GUARDIAN" =
    name === enquiry.fatherName?.trim() ? "FATHER" : name === enquiry.motherName?.trim() ? "MOTHER" : "GUARDIAN";

  return findOrLinkGuardian(sdb, studentId, { name, phone: enquiry.parentContact, email: enquiry.email, relation });
}
