"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, AccessLevel, type StaffCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { auth } from "@/auth";
import { createPendingAccount } from "@/lib/account-setup";
import { setSetupTokenFlash } from "@/lib/setup-token-flash";
import { resetPasswordToDefault } from "@/lib/account-reset";
import { validatePhone, validateOptionalPhone, normalizeIndianMobile, parseMoney } from "@/lib/validation";
import { runAction, UserError } from "@/lib/action-result";
import { formatINR } from "@/lib/format";
import { todayISTDate } from "@/lib/ist";

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
      phone: typeof phone === "string" && phone ? normalizeIndianMobile(phone) : null,
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
  await setSetupTokenFlash(token);
  redirect(`/app/employees/${staff.id}`);
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

/** "2026-09" → "September 2026" */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Pays an employee for a month. Payroll runs once per employee per month
 * (also enforced by payroll_runs' UNIQUE (staff_id, month)); a correction
 * afterwards is a payroll adjustment, never a second run, so the Accounts
 * ledger can't end up with two salary entries for one month.
 */
export async function runPayroll(staffId: string, month: string, amountRaw: number): Promise<{ error?: string; runId?: string }> {
  await requireModuleAccess("Employees", "EDIT");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Pick a valid month." };
  const amount = parseMoney(amountRaw, "Salary amount", { required: true, allowZero: false });
  if (amount.error) return { error: amount.error };

  const result = await runAction(async () => {
    const sdb = await getScopedDb();
    const staff = await sdb.staffProfile.findUnique({ where: { id: staffId }, include: { user: true } });
    if (!staff) throw new UserError("This employee no longer exists. Please refresh the page.");
    const existing = await sdb.payrollRun.findUnique({ where: { staffId_month: { staffId, month } } });
    if (existing) {
      throw new UserError(`Payroll for ${monthLabel(month)} has already been run for ${staff.user.name} (${formatINR(existing.amount)}). To correct it, add an adjustment instead of running payroll again.`);
    }
    const run = await sdb.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: scopedCreateData<Prisma.PayrollRunUncheckedCreateInput>({ staffId, month, amount: amount.value!, status: "PAID", paidOn: new Date() }),
      });
      await tx.accountsTransaction.create({
        data: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
          date: todayISTDate(),
          description: `Staff salary — ${staff.user.name} (${monthLabel(month)})`,
          category: "Payroll",
          source: "AUTO_PAYROLL",
          type: "EXPENSE",
          amount: amount.value!,
          payrollRunId: run.id,
        }),
      });
      return run;
    });
    return { runId: run.id };
  }, "runPayroll");
  if (result.ok !== true) return { error: result.error };

  revalidatePath(`/app/employees/${staffId}`);
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return { runId: result.runId };
}

/**
 * Corrects a month's pay after payroll has run: an addition (paid more) is
 * an extra expense; a deduction (recovered an overpayment) is income. Each
 * gets its own Accounts entry linked to the adjustment.
 */
export async function addPayrollAdjustment(staffId: string, month: string, kind: "ADDITION" | "DEDUCTION", amountRaw: number, reasonRaw: string): Promise<{ error?: string }> {
  await requireModuleAccess("Employees", "EDIT");
  const amount = parseMoney(amountRaw, "Adjustment amount", { required: true, allowZero: false });
  if (amount.error) return { error: amount.error };
  const reason = (reasonRaw ?? "").trim();
  if (!reason) return { error: "Give a reason for the adjustment, e.g. \"Arrears for August\"." };
  if (kind !== "ADDITION" && kind !== "DEDUCTION") return { error: "Choose whether this adds to or deducts from the pay." };

  const result = await runAction(async () => {
    const sdb = await getScopedDb();
    const session = await auth();
    const run = await sdb.payrollRun.findUnique({ where: { staffId_month: { staffId, month } }, include: { staff: { include: { user: true } } } });
    if (!run) throw new UserError(`Payroll hasn't been run for ${monthLabel(month)} yet. Run payroll first; adjustments correct a run that already exists.`);
    await sdb.$transaction(async (tx) => {
      const adj = await tx.payrollAdjustment.create({
        data: scopedCreateData<Prisma.PayrollAdjustmentUncheckedCreateInput>({ payrollRunId: run.id, kind, amount: amount.value!, reason, createdByUserId: session!.user.id }),
      });
      await tx.accountsTransaction.create({
        data: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
          date: todayISTDate(),
          description: `Salary ${kind === "ADDITION" ? "adjustment" : "recovery"} — ${run.staff.user.name} (${monthLabel(month)}): ${reason}`,
          category: "Payroll",
          source: "AUTO_PAYROLL",
          type: kind === "ADDITION" ? "EXPENSE" : "INCOME",
          amount: amount.value!,
          payrollAdjustmentId: adj.id,
        }),
      });
    });
    return {};
  }, "addPayrollAdjustment");
  if (result.ok !== true) return { error: result.error };

  revalidatePath(`/app/employees/${staffId}`);
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return {};
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
    sdb.user.update({ where: { id: staff.userId }, data: { name: fields.name.trim(), phone: normalizeIndianMobile(fields.phone) } }),
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
