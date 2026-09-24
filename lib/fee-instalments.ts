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
  flagged: { studentId: string; studentName: string }[];
};

async function computeAndApply(sdb: ScopedDb, classId: string, yearId: string, opts: { studentId?: string; dryRun: boolean }): Promise<InstalmentPlanResult> {
  const cls = await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { grade: true } });
  const [structures, classFeeDefault, students] = await Promise.all([
    sdb.feeStructure.findMany({ where: { classId, yearId } }),
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

  const result: InstalmentPlanResult = { studentsConsidered: students.length, instalmentsCreated: 0, instalmentsUpdated: 0, flagged: [] };
  if (structures.length === 0) return result;

  const byHead = new Map<string, typeof structures>();
  for (const s of structures) byHead.set(s.head, [...(byHead.get(s.head) ?? []), s]);

  const existing = await sdb.feeInstalment.findMany({
    where: { feeStructureId: { in: structures.map((s) => s.id) }, ...(opts.studentId ? { studentId: opts.studentId } : {}) },
    include: { payments: { select: { id: true }, take: 1 } },
  });
  const existingByKey = new Map(existing.map((e) => [`${e.studentId}:${e.feeStructureId}`, e]));

  const toCreate: Prisma.FeeInstalmentUncheckedCreateInput[] = [];
  const toUpdate: { id: string; amount: number }[] = [];
  const flaggedStudents = new Map<string, string>();

  for (const student of students) {
    const effectiveTotal = student.chargedFee != null ? Number(student.chargedFee) : classFeeDefault ? Number(classFeeDefault.actualFee) : null;
    const studentName = `${student.firstName} ${student.surname}`;

    for (const [head, rows] of byHead) {
      const flatEligibility = FLAT_HEAD_ELIGIBILITY[head];
      if (flatEligibility === "transport" && !student.transportAssignment) continue;
      if (flatEligibility === "hostel" && student.hostelAllocations.length === 0) continue;

      const isFlat = flatEligibility !== undefined;
      const headWeightTotal = rows.reduce((s, r) => s + Number(r.amount), 0);

      for (const row of rows) {
        let amount: number;
        if (isFlat) {
          amount = Number(row.amount);
        } else {
          if (effectiveTotal == null || headWeightTotal <= 0) continue; // no charged/actual fee set yet — nothing to bill
          amount = Math.round((effectiveTotal * Number(row.amount)) / headWeightTotal);
        }
        if (amount <= 0) continue;

        const key = `${student.id}:${row.id}`;
        const existingRow = existingByKey.get(key);
        if (existingRow) {
          if (existingRow.payments.length > 0) {
            if (Number(existingRow.amount) !== amount) flaggedStudents.set(student.id, studentName);
            continue;
          }
          if (Number(existingRow.amount) !== amount) toUpdate.push({ id: existingRow.id, amount });
        } else {
          toCreate.push(scopedCreateData<Prisma.FeeInstalmentUncheckedCreateInput>({ studentId: student.id, feeStructureId: row.id, amount }));
        }
      }
    }
  }

  result.instalmentsCreated = toCreate.length;
  result.instalmentsUpdated = toUpdate.length;
  result.flagged = Array.from(flaggedStudents, ([studentId, studentName]) => ({ studentId, studentName }));

  if (!opts.dryRun) {
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
