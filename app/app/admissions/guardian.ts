import type { Prisma } from "@prisma/client";
import type { ScopedDb } from "@/lib/tenant-db";
import { scopedCreateData } from "@/lib/tenant-db";
import { createPendingAccount } from "@/lib/account-setup";

type EnquiryLike = {
  parentName: string | null;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  parentContact: string;
  email: string | null;
};

/**
 * Creates (or reuses, for a returning family — e.g. a sibling already
 * enrolled) the Guardian/Parent account for a newly admitted student, and
 * links it. Every Parent needs a real User login (Parent.userId is
 * required), so a brand-new guardian also gets a User row via the same
 * one-time setup-link mechanism Staff accounts use — no password is ever
 * set directly. Username is the phone number's digits, the same
 * convention a parent portal login would use (OTP-based phone login is a
 * possible future replacement per claude.md, not built yet).
 *
 * Silently does nothing if the enquiry never captured a parent name — the
 * enquiry form always requires a contact number, but "Parent name" itself
 * is optional at that stage, same as before this fix.
 */
export async function createGuardianAccountForEnquiry(
  tx: ScopedDb,
  enquiry: EnquiryLike,
  studentId: string
): Promise<{ setupToken: string; guardianName: string } | null> {
  const name = enquiry.parentName?.trim() || enquiry.fatherName?.trim() || enquiry.motherName?.trim() || enquiry.guardianName?.trim();
  if (!name) return null;

  const relation: "FATHER" | "MOTHER" | "GUARDIAN" =
    name === enquiry.fatherName?.trim() ? "FATHER" : name === enquiry.motherName?.trim() ? "MOTHER" : "GUARDIAN";

  const phone = enquiry.parentContact.trim();

  const existing = await tx.parent.findFirst({ where: { phone } });
  if (existing) {
    await tx.studentParentLink.upsert({
      where: { studentId_parentId: { studentId, parentId: existing.id } },
      update: {},
      create: scopedCreateData<Prisma.StudentParentLinkUncheckedCreateInput>({ studentId, parentId: existing.id, relation, isPrimary: true }),
    });
    return null; // reused an existing login — nothing new to hand the admin
  }

  const digits = phone.replace(/\D/g, "");
  let username = digits;
  let suffix = 0;
  // Extremely unlikely beyond one collision (two different families
  // reporting the same digits, e.g. a typo'd duplicate) but loop rather
  // than assume.
  while (await tx.user.findUnique({ where: { username } })) {
    suffix += 1;
    username = `${digits}${suffix}`;
  }

  const { token, setupTokenHash, setupTokenExpiresAt, placeholderHash } = await createPendingAccount();

  const user = await tx.user.create({
    data: scopedCreateData<Prisma.UserUncheckedCreateInput>({
      name,
      username,
      phone,
      email: enquiry.email?.trim() || null,
      role: "PARENT",
      passwordHash: placeholderHash,
      setupTokenHash,
      setupTokenExpiresAt,
      mustChangePassword: true,
    }),
  });

  const parent = await tx.parent.create({
    data: scopedCreateData<Prisma.ParentUncheckedCreateInput>({ userId: user.id, name, phone, email: enquiry.email?.trim() || null }),
  });

  await tx.studentParentLink.create({
    data: scopedCreateData<Prisma.StudentParentLinkUncheckedCreateInput>({ studentId, parentId: parent.id, relation, isPrimary: true }),
  });

  return { setupToken: token, guardianName: name };
}
