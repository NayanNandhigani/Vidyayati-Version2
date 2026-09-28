"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-flags";
import type { AccountHeadType, Prisma } from "@prisma/client";

async function schoolId() {
  const session = await auth();
  return session!.user.schoolId!;
}

export async function createAccountHead(name: string, type: AccountHeadType) {
  const sid = await schoolId();
  await requireModuleAccess("Accounts", "EDIT");
  await requireFeature(sid, "accounts.chartOfAccounts");
  const sdb = await getScopedDb();
  await sdb.schoolAccountHead.create({ data: scopedCreateData<Prisma.SchoolAccountHeadUncheckedCreateInput>({ name: name.trim(), type }) });
  revalidatePath("/app/accounts");
}

export async function deleteAccountHead(id: string) {
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();
  await sdb.schoolAccountHead.delete({ where: { id } });
  revalidatePath("/app/accounts");
}

export async function setTransactionAccountHead(transactionId: string, accountHeadId: string | null) {
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();
  await sdb.accountsTransaction.update({ where: { id: transactionId }, data: { accountHeadId } });
  revalidatePath("/app/accounts");
}

export type ManualTransactionFields = { date: string; description: string; category: string; amount: number; type: "INCOME" | "EXPENSE" };

/** Edit/delete only ever touch a MANUAL row — an auto-posted fee/payroll row stays locked to whatever generated it (see AUTO_FEES/AUTO_PAYROLL), same rule as everywhere else in this app that auto vs. manual matters. */
export async function updateManualTransaction(transactionId: string, fields: ManualTransactionFields): Promise<{ error?: string }> {
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();
  const existing = await sdb.accountsTransaction.findUniqueOrThrow({ where: { id: transactionId }, select: { source: true } });
  if (existing.source !== "MANUAL") return { error: "Only manually entered rows can be edited." };

  if (!fields.description.trim()) return { error: "Description is required." };
  if (!Number.isFinite(fields.amount) || fields.amount <= 0) return { error: "Enter a valid amount." };
  if (!fields.date || Number.isNaN(Date.parse(fields.date))) return { error: "Date isn't valid." };

  await sdb.accountsTransaction.update({
    where: { id: transactionId },
    data: { date: new Date(fields.date), description: fields.description.trim(), category: fields.category || null, amount: fields.amount, type: fields.type },
  });
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return {};
}

export async function deleteManualTransaction(transactionId: string): Promise<{ error?: string }> {
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();
  const existing = await sdb.accountsTransaction.findUniqueOrThrow({ where: { id: transactionId }, select: { source: true } });
  if (existing.source !== "MANUAL") return { error: "Only manually entered rows can be deleted." };

  await sdb.accountsTransaction.delete({ where: { id: transactionId } });
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return {};
}

export async function updateAccountsApprovalThreshold(threshold: number | null) {
  const sid = await schoolId();
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();
  await sdb.school.update({ where: { id: sid }, data: { accountsApprovalThreshold: threshold } });
  revalidatePath("/app/accounts");
}

export async function actOnTransactionApproval(transactionId: string, approve: boolean) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can approve transactions.");
  await requireFeature(session!.user.schoolId!, "accounts.approvals");
  const sdb = await getScopedDb();
  await sdb.accountsTransaction.update({ where: { id: transactionId }, data: { approvalStatus: approve ? "APPROVED" : "REJECTED" } });
  revalidatePath("/app/accounts");
}

/** Income & Expenditure statement — grouped by account head (falling back to the free-text category) for a date range. */
export async function getIncomeExpenditureReport(fromDate: string, toDate: string) {
  const sdb = await getScopedDb();
  const transactions = await sdb.accountsTransaction.findMany({
    where: { date: { gte: new Date(fromDate), lte: new Date(toDate) }, approvalStatus: { not: "PENDING" } },
    include: { accountHead: true },
  });

  const groups = new Map<string, { label: string; income: number; expense: number }>();
  for (const t of transactions) {
    const key = t.accountHead?.id ?? t.category ?? "Uncategorized";
    const label = t.accountHead?.name ?? t.category ?? "Uncategorized";
    const entry = groups.get(key) ?? { label, income: 0, expense: 0 };
    if (t.type === "INCOME") entry.income += Number(t.amount);
    else entry.expense += Number(t.amount);
    groups.set(key, entry);
  }

  const rows = [...groups.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense));
  const totalIncome = rows.reduce((s, r) => s + r.income, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  return { rows, totalIncome, totalExpense, net: totalIncome - totalExpense };
}
