"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { studentName } from "@/lib/format";
import { allocatePayment } from "@/lib/fee-instalments";

export type PaymentFormState = { error?: string; success?: boolean };

export async function recordPayment(_prevState: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  await requireModuleAccess("Fees", "EDIT");
  const sdb = await getScopedDb();

  const studentId = formData.get("studentId");
  const amountRaw = formData.get("amount");
  const method = formData.get("method");
  const referenceNo = formData.get("referenceNo");
  const paidOnRaw = formData.get("paidOn");

  if (typeof studentId !== "string" || !studentId || typeof amountRaw !== "string" || !amountRaw || typeof method !== "string" || !method) {
    return { error: "Amount and method are required." };
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }
  const paidOn = typeof paidOnRaw === "string" && paidOnRaw ? new Date(paidOnRaw) : new Date();

  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId }, include: { class: true } });

  const instalments = await sdb.feeInstalment.findMany({
    where: { studentId },
    include: { payments: true, feeStructure: true },
    orderBy: [{ feeStructure: { dueDate: "asc" } }, { createdAt: "asc" }],
  });

  if (instalments.length === 0) {
    return { error: "This student has no fee instalments yet — generate them from Academic Management → Fee Structure first." };
  }

  // One payment can cover several instalments (e.g. two terms paid
  // together): it's split oldest-due first, one FeePayment row per
  // instalment, with a single Accounts income row for the full amount.
  const split = allocatePayment(
    instalments.map((fi) => ({ id: fi.id, amount: Number(fi.amount), paid: fi.payments.reduce((s, p) => s + Number(p.amount), 0) })),
    amount
  );
  if ("error" in split) return { error: split.error };
  const reference = typeof referenceNo === "string" && referenceNo ? referenceNo : null;

  await sdb.$transaction([
    ...split.allocations.map((a) =>
      sdb.feePayment.create({
        data: scopedCreateData<Prisma.FeePaymentUncheckedCreateInput>({
          studentId,
          feeInstalmentId: a.instalmentId,
          amount: a.amount,
          method,
          referenceNo: reference,
          paidOn,
          status: a.settles ? "PAID" : "PARTIAL",
        }),
      })
    ),
    sdb.accountsTransaction.create({
      data: scopedCreateData<Prisma.AccountsTransactionUncheckedCreateInput>({
        date: paidOn,
        description: `Fee payment — ${studentName(student)} (${student.class.grade}-${student.class.section})`,
        category: "Fees",
        source: "AUTO_FEES",
        type: "INCOME",
        amount,
      }),
    }),
  ]);

  revalidatePath("/app/fees");
  revalidatePath("/app/accounts");
  revalidatePath("/app/dashboard");
  return { success: true };
}
