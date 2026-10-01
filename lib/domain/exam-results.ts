import { Prisma } from "@prisma/client";
import { getScopedDb, scopedCreateData, type ScopedDb } from "@/lib/tenant-db";
import { competitionRanks, evaluateStudent, gradeForResult, type MarkCell } from "@/lib/exam-rules";

/**
 * Computes and stores a StudentResult per student for an exam, using the
 * shared rules in lib/exam-rules.ts. Only students with a COMPLETE result
 * (every subject entered, as a mark or AB) get a stored result — total,
 * percentage, grade, pass/fail and a competition rank (ties share a rank).
 * Students with nothing or only some subjects entered have no stored
 * result, so they're left out of ranking and class averages everywhere
 * and show as "Not entered" / "Incomplete". Raw Marks stay the source of
 * truth; StudentResult is a snapshot, safe to recompute any time.
 */
export async function calculateExamResults(examId: string, scoped?: ScopedDb) {
  const sdb = scoped ?? (await getScopedDb());

  const exam = await sdb.exam.findUniqueOrThrow({ where: { id: examId }, select: { classId: true, yearId: true } });
  const examSubjects = await sdb.examSubject.findMany({ where: { examId }, select: { id: true, maxMarks: true, passMarks: true } });
  const students = await sdb.student.findMany({ where: { classId: exam.classId, status: "ACTIVE" }, select: { id: true } });

  const marks = examSubjects.length && students.length
    ? await sdb.mark.findMany({
        where: { examSubjectId: { in: examSubjects.map((es) => es.id) }, studentId: { in: students.map((s) => s.id) } },
        select: { studentId: true, examSubjectId: true, marksObtained: true, isAbsent: true },
      })
    : [];

  const cellsByStudent = new Map<string, Map<string, MarkCell>>();
  for (const m of marks) {
    if (!cellsByStudent.has(m.studentId)) cellsByStudent.set(m.studentId, new Map());
    cellsByStudent.get(m.studentId)!.set(m.examSubjectId, { obtained: m.marksObtained !== null ? Number(m.marksObtained) : null, absent: m.isAbsent });
  }

  const year = await sdb.academicYear.findUniqueOrThrow({ where: { id: exam.yearId }, include: { gradeScale: { include: { bands: true } } } });
  const bands = year.gradeScale?.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })) ?? [];

  const complete: { studentId: string; total: number; max: number; percentage: number; passed: boolean }[] = [];
  for (const s of students) {
    const ev = evaluateStudent(examSubjects, cellsByStudent.get(s.id) ?? new Map());
    if (ev.status === "COMPLETE") complete.push({ studentId: s.id, total: ev.total, max: ev.max, percentage: ev.percentage, passed: ev.passed });
  }
  const ranks = competitionRanks(complete.map((c) => ({ id: c.studentId, total: c.total })));

  await sdb.$transaction(async (tx) => {
    for (const c of complete) {
      const data = {
        totalMarks: c.total,
        maxMarks: c.max,
        percentage: Math.round(c.percentage * 100) / 100,
        grade: gradeForResult(c.percentage, bands),
        resultStatus: c.passed ? ("PASS" as const) : ("FAIL" as const),
        rank: ranks.get(c.studentId) ?? null,
        computedAt: new Date(),
      };
      await tx.studentResult.upsert({
        where: { examId_studentId: { examId, studentId: c.studentId } },
        update: data,
        create: scopedCreateData<Prisma.StudentResultUncheckedCreateInput>({ examId, studentId: c.studentId, ...data }),
      });
    }
    // Students whose result is no longer complete lose any stale result.
    await tx.studentResult.deleteMany({ where: { examId, studentId: { notIn: complete.length ? complete.map((c) => c.studentId) : ["__none__"] } } });
  });

  return { computed: complete.length };
}
