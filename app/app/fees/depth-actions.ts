"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-flags";
import type { DiscountKind, DiscountValueType, Prisma } from "@prisma/client";
import { UserError, requireMoney, requirePercent, runAction } from "@/lib/action-result";

async function schoolId() {
  const session = await auth();
  return session!.user.schoolId!;
}

export async function addFeeDiscount(studentId: string, kind: DiscountKind, valueType: DiscountValueType, value: number, note: string) {
  return runAction(async () => {
    await requireModuleAccess("Fees", "EDIT");
    await requireFeature(await schoolId(), "fees.discountsAndFines");
    if (valueType === "PERCENT") {
      if (requirePercent(value, "Discount") == null || value === 0) throw new UserError("Enter a discount percentage between 1 and 100.");
    } else {
      requireMoney(value, "Discount amount", { required: true, allowZero: false });
    }
    const sdb = await getScopedDb();
    await sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
    await sdb.feeDiscount.create({
      data: scopedCreateData<Prisma.FeeDiscountUncheckedCreateInput>({ studentId, kind, valueType, value, note: note.trim() || null }),
    });
    revalidatePath("/app/fees");
    revalidatePath(`/app/students/${studentId}`);
  }, "addFeeDiscount");
}

export async function removeFeeDiscount(discountId: string) {
  await requireModuleAccess("Fees", "EDIT");
  const sdb = await getScopedDb();
  await sdb.feeDiscount.delete({ where: { id: discountId } });
  revalidatePath("/app/fees");
}

/** An ad-hoc extra charge on a student's fee record — the mirror of addFeeDiscount, but adds. Not tied to any FeeStructure/term. */
export async function addFeeAdjustment(studentId: string, description: string, amount: number) {
  return runAction(async () => {
    await requireModuleAccess("Fees", "EDIT");
    await requireFeature(await schoolId(), "fees.discountsAndFines");
    if (!description.trim()) throw new UserError("Describe the charge, e.g. Lab breakage.");
    requireMoney(amount, "Charge amount", { required: true, allowZero: false });
    const sdb = await getScopedDb();
    await sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
    await sdb.feeAdjustment.create({
      data: scopedCreateData<Prisma.FeeAdjustmentUncheckedCreateInput>({ studentId, description: description.trim(), amount }),
    });
    revalidatePath("/app/fees");
    revalidatePath(`/app/students/${studentId}`);
  }, "addFeeAdjustment");
}

export async function removeFeeAdjustment(adjustmentId: string) {
  await requireModuleAccess("Fees", "EDIT");
  const sdb = await getScopedDb();
  await sdb.feeAdjustment.delete({ where: { id: adjustmentId } });
  revalidatePath("/app/fees");
}

/** A sibling-discount suggestion (10% flat, editable before saving) whenever the student has at least one sibling — reuses Batch 2's sibling detection, doesn't duplicate it. */
export async function suggestSiblingDiscount(studentId: string) {
  const { getSiblings } = await import("../students/depth-actions");
  const siblings = await getSiblings(studentId);
  return siblings.length > 0;
}

export async function updateFeeSettings(latePerDay: number | null, lateGraceDays: number | null, gstNumber: string, gstRatePercent: number | null) {
  return runAction(async () => {
    const sid = await schoolId();
    await requireModuleAccess("Fees", "EDIT");
    requireMoney(latePerDay, "Late fine per day");
    if (lateGraceDays != null && (!Number.isInteger(lateGraceDays) || lateGraceDays < 0)) throw new UserError("Grace days must be a whole number of 0 or more.");
    requirePercent(gstRatePercent, "GST rate");
    const sdb = await getScopedDb();
    await sdb.school.update({
      where: { id: sid },
      data: { feeLateFinePerDay: latePerDay, feeLateFineGraceDays: lateGraceDays, gstNumber: gstNumber.trim() || null, gstRatePercent },
    });
    revalidatePath("/app/fees");
  }, "updateFeeSettings");
}
