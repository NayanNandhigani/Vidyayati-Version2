"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-flags";
import type { Prisma } from "@prisma/client";
import { runAction, UserError, requireMoney, requirePercent } from "@/lib/action-result";

async function schoolId() {
  const session = await auth();
  return session!.user.schoolId!;
}

export async function addSalaryComponent(staffId: string, name: string, amount: number) {
  return runAction(async () => {
    const sid = await schoolId();
    await requireModuleAccess("Employees", "EDIT");
    await requireFeature(sid, "payroll.structuredSalary");
    if (!name.trim()) throw new UserError("Name the component, e.g. Basic or HRA.");
    requireMoney(amount, `${name.trim()} amount`, { required: true, allowZero: false });
    const sdb = await getScopedDb();
    await sdb.salaryComponent.create({ data: scopedCreateData<Prisma.SalaryComponentUncheckedCreateInput>({ staffId, name: name.trim(), amount }) });
    revalidatePath(`/app/employees/${staffId}`);
  }, "addSalaryComponent");
}

export async function removeSalaryComponent(id: string) {
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const component = await sdb.salaryComponent.delete({ where: { id } });
  revalidatePath(`/app/employees/${component.staffId}`);
}

export async function updateStatutoryRates(pfPercent: number | null, esiPercent: number | null, ptFixedAmount: number | null, tdsPercent: number | null) {
  return runAction(async () => {
    const sid = await schoolId();
    await requireModuleAccess("Employees", "EDIT");
    requirePercent(pfPercent, "PF rate");
    requirePercent(esiPercent, "ESI rate");
    requirePercent(tdsPercent, "TDS rate");
    requireMoney(ptFixedAmount, "Professional tax");
    const sdb = await getScopedDb();
    await sdb.school.update({ where: { id: sid }, data: { pfPercent, esiPercent, ptFixedAmount, tdsPercent } });
    revalidatePath("/app/employees");
  }, "updateStatutoryRates");
}

/**
 * The structured sibling of employees/actions.ts's runPayroll — computes
 * gross from SalaryComponents and applies the school's statutory rates.
 * Kept as a separate action rather than modifying runPayroll, so a school
 * without this feature keeps that flow's exact current behavior (a plain
 * admin-entered amount, no breakdown).
 */
export async function runStructuredPayroll(staffId: string, month: string) {
  const sid = await schoolId();
  await requireModuleAccess("Employees", "EDIT");
  await requireFeature(sid, "payroll.structuredSalary");
  const sdb = await getScopedDb();

  const [components, staff, school] = await Promise.all([
    sdb.salaryComponent.findMany({ where: { staffId } }),
    sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } }),
    sdb.school.findUniqueOrThrow({ where: { id: sid } }),
  ]);

  const gross = components.reduce((s, c) => s + Number(c.amount), 0);
  const pf = school.pfPercent ? (gross * Number(school.pfPercent)) / 100 : 0;
  const esi = school.esiPercent ? (gross * Number(school.esiPercent)) / 100 : 0;
  const tds = school.tdsPercent ? (gross * Number(school.tdsPercent)) / 100 : 0;
  const pt = school.ptFixedAmount ? Number(school.ptFixedAmount) : 0;

  // LOP only applies once Batch 11's staff-leave feature is on — a school
  // without it simply gets lop = 0, identical to before that feature existed.
  const leaveEnabled = await requireFeature(sid, "employees.leave").then(() => true).catch(() => false);
  const lopDays = leaveEnabled ? await (await import("./hr-depth-actions")).getLopDaysForMonth(staffId, month) : 0;
  const lop = lopDays > 0 ? (gross / 30) * lopDays : 0;

  const net = Math.max(0, gross - pf - esi - tds - pt - lop);

  const existing = await sdb.payrollRun.findUnique({ where: { staffId_month: { staffId, month } }, select: { id: true } });
  if (existing) {
    return { error: `Payroll for ${month} has already been run for ${staff.user.name}. To correct it, add an adjustment instead of running payroll again.` };
  }
  if (gross <= 0) return { error: "Add salary components first — the gross salary is ₹0." };

  // See employees/actions.ts's runPayroll for why this is an interactive
  // transaction keyed by payrollRunId rather than two independent creates —
  // a same-month re-run must edit the one linked Accounts row, not add a
  // second one.
  await sdb.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: scopedCreateData<Prisma.PayrollRunUncheckedCreateInput>({
        staffId,
        month,
        amount: net,
        status: "PAID",
        paidOn: new Date(),
        grossAmount: gross,
        pfAmount: pf,
        esiAmount: esi,
        tdsAmount: tds,
        ptAmount: pt,
        lopAmount: lop || null,
      }),
    });
    await tx.accountsTransaction.create({
      data: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
        date: new Date(),
        description: `Staff salary — ${staff.user.name} (${month})`,
        category: "Payroll",
        source: "AUTO_PAYROLL",
        type: "EXPENSE",
        amount: net,
        payrollRunId: run.id,
      }),
    });
  });

  revalidatePath(`/app/employees/${staffId}`);
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return { gross, pf, esi, tds, pt, lop, net };
}
