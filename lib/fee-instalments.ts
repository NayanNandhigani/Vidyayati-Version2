import type { Prisma } from "@prisma/client";
import type { ScopedDb } from "./tenant-db";
import { scopedCreateData } from "./tenant-db";

// Fee heads billed as a flat amount per eligible student (the FeeStructure
// row's own `amount`), rather than split proportionally against the
// student's chargedFee. Only students with the matching assignment are
// eligible. Any other head (including the default "Tuition") is billed
// proportionally — see computeAndApply below.
const FLAT_HEAD_ELIGIBILITY: Record<string, "transport" | "hostel"> = {
  Transport: "transport",
  Hostel: "hostel",
};

export type InstalmentPlanResult = {
  studentsConsidered: number;
  instalmentsCreated: number;
  instalmentsUpdated: number;
  instalmentsRemoved: number;
  flagged: { studentId: string; studentName: string }[];
};

/**
 * Splits `total` across terms in proportion to their weights, in whole
 * rupees. The last term takes the rounding remainder so the terms always
 * add up to exactly `total` (₹10,000 over three equal terms is
 * 3,333 + 3,333 + 3,334, not 3 × 3,333).
 */
export function splitProportionally(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((s, w) => s + w, 0);
  if (weightTotal <= 0) return weights.map(() => 0);
  const lastWeighted = weights.reduce((last, w, i) => (w > 0 ? i : last), -1);
  let allocated = 0;
  return weights.map((w, i) => {
    if (w <= 0) return 0;
    if (i === lastWeighted) return total - allocated;
    const share = Math.round((total * w) / weightTotal);
    allocated += share;
    return share;
  });
}

async function computeAndApply(sdb: ScopedDb, classId: string, yearId: string, opts: { studentId?: string; dryRun: boolean }): Promise<InstalmentPlanResult> {
  const cls = await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { grade: true } });
  const [structures, classFeeDefault, students] = await Promise.all([
    sdb.feeStructure.findMany({ where: { classId, yearId }, orderBy: [{ dueDate: "asc" }, { term: "asc" }] }),
    sdb.classFeeDefault.findUnique({ where: { yearId_grade: { yearId, grade: cls.grade } } }),
    sdb.student.findMany({
      where: { classId, status: "ACTIVE", ...(opts.studentId ? { id: opts.studentId } : {}) },
      select: {
        id: true,
        firstName: true,
        surname: true,
        chargedFee: true,
        transportAssignment: { select: { studentId: true } },
        hostelAllocations: { select: { id: true }, take: 1 },
      },
    }),
  ]);

  const result: InstalmentPlanResult = { studentsConsidered: students.length, instalmentsCreated: 0, instalmentsUpdated: 0, instalmentsRemoved: 0, flagged: [] };
  const studentIds = students.map((st) => st.id);

  // Every instalment these students already have for this academic year,
  // including ones from another class (a student who moved section keeps
  // the old section's instalments until they're reconciled here).
  const existing = await sdb.feeInstalment.findMany({
    where: { studentId: { in: studentIds }, feeStructure: { yearId } },
    include: { payments: { select: { id: true }, take: 1 }, feeStructure: { select: { classId: true, head: true, term: true } } },
  });
  const inThisClass = existing.filter((e) => e.feeStructure.classId === classId);
  const fromOtherClass = existing.filter((e) => e.feeStructure.classId !== classId);
  const existingByKey = new Map(inThisClass.map((e) => [`${e.studentId}:${e.feeStructureId}`, e]));
  // A term already paid (even partly) in the student's previous class
  // stands in for the same head/term here, so moving section never bills
  // that term twice.
  const paidElsewhere = new Set(fromOtherClass.filter((e) => e.payments.length > 0).map((e) => `${e.studentId}:${e.feeStructure.head}:${e.feeStructure.term}`));

  const byHead = new Map<string, typeof structures>();
  for (const st of structures) byHead.set(st.head, [...(byHead.get(st.head) ?? []), st]);

  const toCreate: Prisma.FeeInstalmentUncheckedCreateInput[] = [];
  const toUpdate: { id: string; amount: number }[] = [];
  const wanted = new Set<string>(); // instalment keys that should exist after this run
  const flaggedStudents = new Map<string, string>();

  for (const student of students) {
    const effectiveTotal = student.chargedFee != null ? Number(student.chargedFee) : classFeeDefault ? Number(classFeeDefault.actualFee) : null;
    const studentName = `${student.firstName} ${student.surname}`;

    for (const [head, rows] of byHead) {
      const flatEligibility = FLAT_HEAD_ELIGIBILITY[head];
      if (flatEligibility === "transport" && !student.transportAssignment) continue;
      if (flatEligibility === "hostel" && student.hostelAllocations.length === 0) continue;

      let amounts: number[];
      if (flatEligibility !== undefined) {
        amounts = rows.map((r) => Number(r.amount));
      } else {
        if (effectiveTotal == null) continue; // no charged/actual fee set yet — nothing to bill
        amounts = splitProportionally(effectiveTotal, rows.map((r) => Number(r.amount)));
      }

      rows.forEach((row, i) => {
        const amount = amounts[i]!;
        if (amount <= 0) return;
        if (paidElsewhere.has(`${student.id}:${head}:${row.term}`)) return;

        const key = `${student.id}:${row.id}`;
        wanted.add(key);
        const existingRow = existingByKey.get(key);
        if (existingRow) {
          if (existingRow.payments.length > 0) {
            if (Number(existingRow.amount) !== amount) flaggedStudents.set(student.id, studentName);
            return;
          }
          if (Number(existingRow.amount) !== amount) toUpdate.push({ id: existingRow.id, amount });
        } else {
          toCreate.push(scopedCreateData<Prisma.FeeInstalmentUncheckedCreateInput>({ studentId: student.id, feeStructureId: row.id, amount }));
        }
      });
    }
  }

  // Unpaid instalments nobody should owe any more: left behind in a
  // previous section, or no longer due here (charged fee set to 0,
  // transport/hostel assignment removed). Paid ones are never removed —
  // they're the payment history.
  const toRemove = [
    ...fromOtherClass.filter((e) => e.payments.length === 0),
    ...inThisClass.filter((e) => e.payments.length === 0 && !wanted.has(`${e.studentId}:${e.feeStructureId}`)),
  ].map((e) => e.id);

  result.instalmentsCreated = toCreate.length;
  result.instalmentsUpdated = toUpdate.length;
  result.instalmentsRemoved = toRemove.length;
  result.flagged = Array.from(flaggedStudents, ([studentId, studentName]) => ({ studentId, studentName }));

  if (!opts.dryRun) {
    if (toRemove.length > 0) await sdb.feeInstalment.deleteMany({ where: { id: { in: toRemove } } });
    if (toCreate.length > 0) await sdb.feeInstalment.createMany({ data: toCreate });
    for (const u of toUpdate) await sdb.feeInstalment.update({ where: { id: u.id }, data: { amount: u.amount } });
  }

  return result;
}

/** Dry run — how many instalments a generate/regenerate would create or update, and which students it would skip because they already have payments against a changed amount. Used for the "Generate / Regenerate instalments" confirmation preview. */
export async function previewInstalmentGeneration(sdb: ScopedDb, classId: string, yearId: string): Promise<InstalmentPlanResult> {
  return computeAndApply(sdb, classId, yearId, { dryRun: true });
}

/** Generates/refreshes fee instalments for every active student in a class, from that class's FeeStructure plan. Never rewrites an instalment that already has a payment against it. */
export async function generateInstalmentsForClass(sdb: ScopedDb, classId: string, yearId: string): Promise<InstalmentPlanResult> {
  return computeAndApply(sdb, classId, yearId, { dryRun: false });
}

/** Same as generateInstalmentsForClass, scoped to one newly admitted/transferred-in student. */
export async function generateInstalmentsForStudent(sdb: ScopedDb, studentId: string, classId: string, yearId: string): Promise<InstalmentPlanResult> {
  return computeAndApply(sdb, classId, yearId, { dryRun: false, studentId });
}

export type FeePlanTerm = { term: string; amount: number; dueDate: string };

/**
 * Saves one fee head's instalment plan for every section of a grade and
 * regenerates each student's instalments from it. Terms left out of
 * `terms` (removed or renamed in the editor) are deleted along with their
 * unpaid instalments — unless someone has already paid against them, in
 * which case nothing is changed and an error names the term.
 */
export async function applyFeePlan(sdb: ScopedDb, yearId: string, grade: string, head: string, terms: FeePlanTerm[]): Promise<InstalmentPlanResult | { error: string }> {
  const names = terms.map((t) => t.term.trim());
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  if (duplicate) return { error: `"${duplicate}" appears twice. Each term needs a different name.` };

  const classes = await sdb.class.findMany({ where: { yearId, grade }, select: { id: true } });
  if (classes.length === 0) return { error: `No sections exist for Class ${grade} yet.` };
  const classIds = classes.map((c) => c.id);

  const dropped = await sdb.feeStructure.findMany({ where: { classId: { in: classIds }, yearId, head, term: { notIn: names } }, select: { id: true, term: true } });
  if (dropped.length > 0) {
    const paid = await sdb.feePayment.findMany({
      where: { feeInstalment: { feeStructureId: { in: dropped.map((d) => d.id) } } },
      select: { feeInstalment: { select: { feeStructure: { select: { term: true } } } } },
      distinct: ["feeInstalmentId"],
    });
    const paidTerms = Array.from(new Set(paid.map((p) => p.feeInstalment.feeStructure.term)));
    if (paidTerms.length > 0) {
      return { error: `Payments have already been recorded against ${paidTerms.join(", ")}, so ${paidTerms.length === 1 ? "it" : "they"} can't be removed or renamed. Add ${paidTerms.length === 1 ? "it" : "them"} back to the plan and save again.` };
    }
    await sdb.feeStructure.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } }); // cascades to their (unpaid) instalments
  }

  for (const classId of classIds) {
    for (const t of terms) {
      const term = t.term.trim();
      await sdb.feeStructure.upsert({
        where: { classId_yearId_head_term: { classId, yearId, head, term } },
        update: { amount: t.amount, dueDate: new Date(t.dueDate) },
        create: scopedCreateData<Prisma.FeeStructureUncheckedCreateInput>({ classId, yearId, head, term, amount: t.amount, dueDate: new Date(t.dueDate) }),
      });
    }
  }

  return regenerateInstalmentsForGrade(sdb, yearId, grade);
}

/** Regenerates instalments for every section of a grade, e.g. after its actual fee or instalment plan changes. */
export async function regenerateInstalmentsForGrade(sdb: ScopedDb, yearId: string, grade: string): Promise<InstalmentPlanResult> {
  const classes = await sdb.class.findMany({ where: { yearId, grade }, select: { id: true } });
  const total: InstalmentPlanResult = { studentsConsidered: 0, instalmentsCreated: 0, instalmentsUpdated: 0, instalmentsRemoved: 0, flagged: [] };
  for (const cls of classes) {
    const r = await generateInstalmentsForClass(sdb, cls.id, yearId);
    total.studentsConsidered += r.studentsConsidered;
    total.instalmentsCreated += r.instalmentsCreated;
    total.instalmentsUpdated += r.instalmentsUpdated;
    total.instalmentsRemoved += r.instalmentsRemoved;
    total.flagged.push(...r.flagged);
  }
  return total;
}

export type OpenInstalment = { id: string; amount: number; paid: number };

/**
 * Spreads one payment across a student's instalments, oldest due first, so
 * a parent paying two terms at once is recorded against both. Returns the
 * per-instalment split, or an error if the payment is more than the
 * student owes in total.
 */
export function allocatePayment(instalments: OpenInstalment[], amount: number): { allocations: { instalmentId: string; amount: number; settles: boolean }[] } | { error: string } {
  const open = instalments.filter((fi) => fi.paid < fi.amount);
  const outstanding = open.reduce((s, fi) => s + (fi.amount - fi.paid), 0);
  if (open.length === 0) return { error: "This student has no outstanding fees to apply a payment to." };
  if (amount > outstanding + 1e-9) return { error: `This payment is more than the student owes (₹${outstanding.toFixed(2)} outstanding in total).` };

  const allocations: { instalmentId: string; amount: number; settles: boolean }[] = [];
  let left = amount;
  for (const fi of open) {
    if (left <= 1e-9) break;
    const due = fi.amount - fi.paid;
    const part = Math.min(due, left);
    allocations.push({ instalmentId: fi.id, amount: Math.round(part * 100) / 100, settles: part >= due - 1e-9 });
    left -= part;
  }
  return { allocations };
}
