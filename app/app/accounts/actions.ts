"use server";

import { revalidatePath } from "next/cache";
import { Prisma, TxnType } from "@prisma/client";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { hasFeature } from "@/lib/feature-flags";
import { parseMoney } from "@/lib/validation";
import { parseDateOnly } from "@/lib/ist";
import { formatINR } from "@/lib/format";

type TxnValues = { type: string; date: string; description: string; category: string; amount: string };
export type TransactionFormState = { error?: string; success?: boolean; fieldErrors?: Partial<Record<keyof TxnValues, string>>; values?: TxnValues; attempt?: number; savedMessage?: string };

export async function addTransaction(_prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  await requireModuleAccess("Accounts", "EDIT");
  const sdb = await getScopedDb();

  const values: TxnValues = {
    type: String(formData.get("type") ?? ""),
    date: String(formData.get("date") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
  };
  const fieldErrors: NonNullable<TransactionFormState["fieldErrors"]> = {};
  if (values.type !== "INCOME" && values.type !== "EXPENSE") fieldErrors.type = "Choose Income or Expense.";
  if (!values.date) fieldErrors.date = "Pick the date of the transaction.";
  else if (!parseDateOnly(values.date)) fieldErrors.date = "That isn't a valid date.";
  if (!values.description.trim()) fieldErrors.description = "Describe the transaction, e.g. Generator fuel — August.";
  else if (values.description.trim().length > 200) fieldErrors.description = "Keep the description under 200 characters.";
  const money = parseMoney(values.amount, "Amount", { required: true, allowZero: false });
  if (money.error) fieldErrors.amount = money.error;
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values, attempt: Date.now() };
  }
  const type = values.type as TxnType;
  const date = values.date;
  const description = values.description;
  const category = values.category || null;
  const amount = money.value!;

  // Additive: a school without accounts.approvals enabled (or with no
  // threshold configured) always gets approvalStatus "NONE", the exact
  // same as before this column existed — every ledger/balance
  // computation already only excludes "PENDING" rows.
  const session = await auth();
  const approvalsEnabled = await hasFeature(session!.user.schoolId, "accounts.approvals");
  const school = approvalsEnabled ? await sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { accountsApprovalThreshold: true } }) : null;
  const threshold = school?.accountsApprovalThreshold ? Number(school.accountsApprovalThreshold) : null;
  const needsApproval = threshold != null && amount >= threshold;

  await sdb.accountsTransaction.create({
    data: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
      date: parseDateOnly(date)!,
      description: description.trim(),
      category,
      source: "MANUAL",
      type,
      amount,
      approvalStatus: needsApproval ? "PENDING" : "NONE",
    }),
  });

  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return { success: true, attempt: Date.now(), savedMessage: needsApproval ? `Added ${formatINR(amount)} — waiting for approval because it's above the approval threshold.` : `Added ${type === "INCOME" ? "income" : "expense"} of ${formatINR(amount)}.` };
}
