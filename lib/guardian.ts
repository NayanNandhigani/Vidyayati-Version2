import type { Prisma, ParentRelation } from "@prisma/client";
import type { ScopedDb } from "@/lib/tenant-db";
import { scopedCreateData } from "@/lib/tenant-db";
import { initialPasswordFields } from "@/lib/initial-password";

/**
 * Creates (or reuses, for a returning family — e.g. a sibling already
 * enrolled, matched by phone) a Guardian/Parent account and links it to a
 * student. Every Parent needs a real User login (Parent.userId is
 * required), so a brand-new guardian also gets a User row via the same
 * one-time setup-link mechanism Staff accounts use — no password is ever
 * set directly. Username is the phone number's digits (OTP-based phone
 * login is a possible future replacement per claude.md, not built yet).
 *
 * Returns the one-time setup link's token when a new login was created,
 * or null when an existing guardian was reused (nothing new to hand the
 * admin) — callers should show the token to the admin inline, never in a
 * URL.
 */
export async function findOrLinkGuardian(
  sdb: ScopedDb,
  studentId: string,
  guardian: { name: string; phone: string; email: string | null; relation: ParentRelation }
): Promise<{ username: string; guardianName: string } | null> {
  const name = guardian.name.trim();
  const phone = guardian.phone.trim();

  const existing = await sdb.parent.findFirst({ where: { phone } });
  if (existing) {
    await sdb.studentParentLink.upsert({
      where: { studentId_parentId: { studentId, parentId: existing.id } },
      update: {},
      create: scopedCreateData<Prisma.StudentParentLinkUncheckedCreateInput>({ studentId, parentId: existing.id, relation: guardian.relation, isPrimary: true }),
    });
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  let username = digits;
  let suffix = 0;
  while (await sdb.user.findUnique({ where: { username } })) {
    suffix += 1;
    username = `${digits}${suffix}`;
  }

  const initialPassword = await initialPasswordFields();

  const user = await sdb.user.create({
    data: scopedCreateData<Prisma.UserUncheckedCreateInput>({
      name,
      username,
      phone,
      email: guardian.email?.trim() || null,
      role: "PARENT",
      ...initialPassword,
    }),
  });

  const parent = await sdb.parent.create({
    data: scopedCreateData<Prisma.ParentUncheckedCreateInput>({ userId: user.id, name, phone, email: guardian.email?.trim() || null }),
  });

  await sdb.studentParentLink.create({
    data: scopedCreateData<Prisma.StudentParentLinkUncheckedCreateInput>({ studentId, parentId: parent.id, relation: guardian.relation, isPrimary: true }),
  });

  return { username, guardianName: name };
}
