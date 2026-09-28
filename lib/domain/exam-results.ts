import { Prisma } from "@prisma/client";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { gradeFor, gradeForScale } from "@/lib/academic";

/**
 * Computes and persists a StudentResult row per student for an exam —
 * total/percentage/grade/rank/pass-fail. A student with zero entered (and
 * non-absent) marks gets no StudentResult at all — excluded from rank,
 * grade and averages everywhere, rather than silently scoring 0 the way
 * this used to work. A student with marks for only some subjects is
 * scored over just those subjects' combined max (not the whole exam's),
 * so a partial entry doesn't drag them down as if the ungraded subjects
 * were zeros either. Raw Marks stay the source of truth; StudentResult is
 * a computed snapshot, safe to recompute and overwrite any time.
 */
export async function calculateExamResults(examId: string) {
  const sdb = await getScopedDb();

  const exam = await sdb.exam.findUniqueOrThrow({ where: { id: examId }, select: { classId: true, yearId: true } });
  const examSubjects = await sdb.examSubject.findMany({ where: { examId }, select: { id: true, maxMarks: true, passMarks: true } });
  const students = await sdb.student.findMany({ where: { classId: exam.classId, status: "ACTIVE" }, select: { id: true } });

  if (examSubjects.length === 0 || students.length === 0) return { computed: 0 };

  const marks = await sdb.mark.findMany({
    where: { examSubjectId: { in: examSubjects.map((es) => es.id) }, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, examSubjectId: true, marksObtained: true, isAbsent: true },
  });

  const marksByStudent = new Map<string, Map<string, { obtained: number | null; isAbsent: boolean }>>();
  for (const m of marks) {
    if (!marksByStudent.has(m.studentId)) marksByStudent.set(m.studentId, new Map());
    marksByStudent.get(m.studentId)!.set(m.examSubjectId, { obtained: m.marksObtained !== null ? Number(m.marksObtained) : null, isAbsent: m.isAbsent });
  }

  const anyPassMarksConfigured = examSubjects.some((es) => es.passMarks != null);

  type Row = { studentId: string; total: number; max: number; failed: boolean };
  const rows: Row[] = [];

  for (const s of students) {
    const row = marksByStudent.get(s.id);
    if (!row) continue; // nothing entered at all — no result

    let total = 0;
    let max = 0;
    let enteredCount = 0;
    let failed = false;
    for (const es of examSubjects) {
      const entry = row.get(es.id);
      if (!entry) continue; // this subject not entered — excluded, not zero
      enteredCount += 1;
      if (entry.isAbsent) {
        if (es.passMarks != null) failed = true; // absent counts as failing that subject when it's pass/fail-eligible
        continue; // absent contributes no marks and no max — excluded like "not entered"
      }
      const obtained = entry.obtained ?? 0;
      total += obtained;
      max += es.maxMarks;
      if (es.passMarks != null && obtained < es.passMarks) failed = true;
    }
    if (enteredCount === 0) continue; // every subject was absent, nothing to score

    rows.push({ studentId: s.id, total, max, failed });
  }

  const year = await sdb.academicYear.findUniqueOrThrow({ where: { id: exam.yearId }, include: { gradeScale: { include: { bands: true } } } });
  const gradeBands = year.gradeScale?.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })) ?? [];

  const ranked = [...rows].sort((a, b) => b.total / (b.max || 1) - a.total / (a.max || 1));

  for (const { studentId, total, max, failed } of rows) {
    const pct = max > 0 ? (total / max) * 100 : 0;
    const rank = ranked.findIndex((r) => r.studentId === studentId) + 1;
    // A subject fail caps the overall grade at the bottom band, same as a
    // real school report card — the grading scale otherwise decides.
    const grade = failed ? (gradeBands.length ? gradeBands[gradeBands.length - 1].label : "F") : (gradeForScale(pct, gradeBands) ?? gradeFor(pct));
    const resultStatus = anyPassMarksConfigured ? (failed ? "FAIL" : "PASS") : null;

    await sdb.studentResult.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { totalMarks: total, maxMarks: max, percentage: pct, grade, resultStatus, rank, computedAt: new Date() },
      create: scopedCreateData<Prisma.StudentResultUncheckedCreateInput>({
        examId,
        studentId,
        totalMarks: total,
        maxMarks: max,
        percentage: pct,
        grade,
        resultStatus,
        rank,
      }),
    });
  }

  // Students who dropped to "nothing entered / all absent" since the last
  // computation shouldn't keep a stale result around.
  const keepStudentIds = rows.map((r) => r.studentId);
  await sdb.studentResult.deleteMany({ where: { examId, studentId: { notIn: keepStudentIds.length > 0 ? keepStudentIds : ["__none__"] } } });

  return { computed: rows.length };
}
