"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, AccessLevel, type StaffCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { auth } from "@/auth";
import { createPendingAccount } from "@/lib/account-setup";
import { resetPasswordToDefault } from "@/lib/account-reset";
import { validatePhone, validateOptionalPhone } from "@/lib/validation";

export type StaffFormState = { error?: string };

export async function createStaff(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") return { error: "Only a School Admin can add staff." };
  const sdb = await getScopedDb();

  const name = formData.get("name");
  const username = formData.get("username");
  const phone = formData.get("phone");
  const designation = formData.get("designation");
  const department = formData.get("department");
  const staffCategory = formData.get("staffCategory");

  if (typeof name !== "string" || !name.trim() || typeof username !== "string" || !username.trim()) {
    return { error: "Name and username are required." };
  }
  if (typeof phone === "string" && phone) {
    const phoneErr = validateOptionalPhone(phone);
    if (phoneErr) return { error: phoneErr };
  }

  const normalizedUsername = username.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { username: normalizedUsername } });
  if (existing) return { error: "A user with this username already exists." };

  const school = await db.school.findUnique({ where: { id: session!.user.schoolId! }, select: { maxStaff: true } });
  if (school?.maxStaff != null) {
    const staffCount = await sdb.user.count({ where: { role: "STAFF" } });
    if (staffCount >= school.maxStaff) {
      return { error: `This school's staff limit (${school.maxStaff}) has been reached. Contact Vidya Yati to raise it.` };
    }
  }

  const { token, setupTokenHash, setupTokenExpiresAt, placeholderHash } = await createPendingAccount();

  const user = await sdb.user.create({
    data: scopedCreateData<Prisma.UserUncheckedCreateInput>({
      name: name.trim(),
      username: normalizedUsername,
      phone: typeof phone === "string" && phone ? phone : null,
      role: "STAFF",
      passwordHash: placeholderHash,
      setupTokenHash,
      setupTokenExpiresAt,
    }),
  });

  const staff = await sdb.staffProfile.create({
    data: scopedCreateData<Prisma.StaffProfileUncheckedCreateInput>({
      userId: user.id,
      designation: typeof designation === "string" && designation ? designation : null,
      department: typeof department === "string" && department ? department : null,
      staffCategory: staffCategory === "NON_TEACHING" ? "NON_TEACHING" : "TEACHING",
      dateJoined: new Date(),
    }),
  });

  revalidatePath("/app/employees");
  redirect(`/app/employees/${staff.id}?setupToken=${token}`);
}

export async function cyclePermission(staffId: string, moduleName: string, classId: string | null = null) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can change permissions.");
  const sdb = await getScopedDb();
  await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { id: true } });
  if (classId !== null) await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { id: true } });

  const CYCLE: AccessLevel[] = ["NONE", "VIEW", "EDIT"];

  // Prisma's compound-unique-key lookup type requires a non-null classId
  // (it can't express "classId IS NULL" through that path, even though the
  // column itself is nullable) — so the school-wide row (classId: null)
  // has to be resolved through a regular where-filter + explicit
  // create/update instead of upsert() on the compound key.
  if (classId === null) {
    const existing = await sdb.staffPermission.findFirst({ where: { staffId, moduleName, classId: null } });
    const next = CYCLE[(CYCLE.indexOf(existing?.accessLevel ?? "NONE") + 1) % CYCLE.length];
    if (existing) {
      await sdb.staffPermission.update({ where: { id: existing.id }, data: { accessLevel: next } });
    } else {
      await sdb.staffPermission.create({ data: scopedCreateData<Prisma.StaffPermissionUncheckedCreateInput>({ staffId, moduleName, classId: null, accessLevel: next }) });
    }
    revalidatePath(`/app/employees/${staffId}`);
    return { accessLevel: next };
  }

  const existing = await sdb.staffPermission.findUnique({ where: { staffId_moduleName_classId: { staffId, moduleName, classId } } });
  const next = CYCLE[(CYCLE.indexOf(existing?.accessLevel ?? "NONE") + 1) % CYCLE.length];

  await sdb.staffPermission.upsert({
    where: { staffId_moduleName_classId: { staffId, moduleName, classId } },
    update: { accessLevel: next },
    create: scopedCreateData<Prisma.StaffPermissionUncheckedCreateInput>({ staffId, moduleName, classId, accessLevel: next }),
  });

  revalidatePath(`/app/employees/${staffId}`);
  return { accessLevel: next };
}

export async function removeClassPermission(staffId: string, moduleName: string, classId: string) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can change permissions.");
  const sdb = await getScopedDb();

  await sdb.staffPermission.delete({ where: { staffId_moduleName_classId: { staffId, moduleName, classId } } }).catch(() => {});
  revalidatePath(`/app/employees/${staffId}`);
}

export async function runPayroll(staffId: string, month: string, amount: number) {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();

  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });

  // One payroll run per staff/month (enforced by the staffId_month unique
  // constraint) — a re-run for the same month EDITS this same run and its
  // linked Accounts row (matched by payrollRunId, also unique) instead of
  // creating a second ledger entry. Interactive transaction because the
  // Accounts upsert needs the run's id, which only exists after the first
  // write.
  const run = await sdb.$transaction(async (tx) => {
    const run = await tx.payrollRun.upsert({
      where: { staffId_month: { staffId, month } },
      update: { amount, status: "PAID", paidOn: new Date() },
      create: scopedCreateData<Prisma.PayrollRunUncheckedCreateInput>({ staffId, month, amount, status: "PAID", paidOn: new Date() }),
    });
    await tx.accountsTransaction.upsert({
      where: { payrollRunId: run.id },
      update: { date: new Date(), description: `Staff salary — ${staff.user.name} (${month})`, amount },
      create: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
        date: new Date(),
        description: `Staff salary — ${staff.user.name} (${month})`,
        category: "Payroll",
        source: "AUTO_PAYROLL",
        type: "EXPENSE",
        amount,
        payrollRunId: run.id,
      }),
    });
    return run;
  });

  revalidatePath(`/app/employees/${staffId}`);
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return { runId: run.id };
}

export type StaffCoreFields = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  staffCategory: StaffCategory;
  dateJoined: string; // yyyy-mm-dd, or ""
};

/** Edits the basics the QA pass found had no edit path at all — name, phone, designation, department, staff category (Teaching/Non-teaching), date of joining. Salary lives entirely in SalaryComponent rows, which already have their own CRUD. */
export async function updateStaffCore(staffId: string, fields: StaffCoreFields): Promise<{ error?: string }> {
  await requireModuleAccess("Employees", "EDIT");
  if (!fields.name.trim()) return { error: "Name is required." };
  const phoneErr = validatePhone(fields.phone, "Phone number");
  if (phoneErr) return { error: phoneErr };

  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });

  await sdb.$transaction([
    sdb.user.update({ where: { id: staff.userId }, data: { name: fields.name.trim(), phone: fields.phone.trim() } }),
    sdb.staffProfile.update({
      where: { id: staffId },
      data: {
        designation: fields.designation.trim() || null,
        department: fields.department.trim() || null,
        staffCategory: fields.staffCategory,
        dateJoined: fields.dateJoined ? new Date(fields.dateJoined) : null,
      },
    }),
  ]);

  revalidatePath(`/app/employees/${staffId}`);
  revalidatePath("/app/employees");
  return {};
}

/** Blocks login (User.status = INACTIVE — auth.ts already refuses sign-in for anything but ACTIVE) without touching the staff record itself, so payroll/attendance/permission history stays intact and reactivating just flips it back. */
export async function deactivateStaff(staffId: string) {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });
  await sdb.user.update({ where: { id: staff.userId }, data: { status: "INACTIVE" } });
  revalidatePath(`/app/employees/${staffId}`);
}

export async function reactivateStaff(staffId: string) {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });
  await sdb.user.update({ where: { id: staff.userId }, data: { status: "ACTIVE" } });
  revalidatePath(`/app/employees/${staffId}`);
}

/** Support escape hatch for a locked-out staff member — same mechanism as Super Admin's school-admin reset. */
export async function resetStaffPassword(staffId: string) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can reset a staff member's password.");
  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });
  await resetPasswordToDefault(staff.userId);
  revalidatePath(`/app/employees/${staffId}`);
}

/** Issues a fresh one-time setup link (invalidating any old one) — the alternative to a temporary password when the staffer would rather set their own. Returns the token for the admin to hand over inline, never in a URL. */
export async function regenerateStaffSetupLink(staffId: string): Promise<{ setupToken: string }> {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });
  const { token, setupTokenHash, setupTokenExpiresAt } = await createPendingAccount();
  await sdb.user.update({ where: { id: staff.userId }, data: { setupTokenHash, setupTokenExpiresAt, mustChangePassword: true } });
  revalidatePath(`/app/employees/${staffId}`);
  return { setupToken: token };
}

/** Soft delete — StaffProfile.deletedAt, distinct from deactivation: hides the staffer from Employees listings entirely rather than just blocking their login, but keeps every history table (payroll, attendance, permissions) intact. Also deactivates the login, since a deleted staffer shouldn't still be able to sign in. */
export async function deleteStaff(staffId: string) {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const staff = await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { userId: true } });
  await sdb.$transaction([
    sdb.staffProfile.update({ where: { id: staffId }, data: { deletedAt: new Date() } }),
    sdb.user.update({ where: { id: staff.userId }, data: { status: "INACTIVE" } }),
  ]);
  revalidatePath("/app/employees");
}
