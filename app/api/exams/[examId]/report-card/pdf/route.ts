import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { studentName } from "@/lib/format";
import { ReportCardDocument, type ReportCardStudent } from "@/lib/report-card-pdf";

/**
 * GET /api/exams/[examId]/report-card/pdf            — every student in the exam's class
 * GET /api/exams/[examId]/report-card/pdf?studentId=X — just that one student
 *
 * Rank is always computed across the whole class (not just whichever
 * student(s) end up in the PDF), so a single-student download still shows
 * their real rank among classmates. Streamed `inline` (not `attachment`)
 * so the browser's own PDF viewer gives both "print" and "download" from
 * one link, matching the "print or download" ask.
 */
export async function GET(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const studentId = new URL(req.url).searchParams.get("studentId");

  const sdb = await getScopedDb();
  const exam = await sdb.exam.findFirst({ where: { id: examId }, include: { class: true, school: true } });
  if (!exam) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    await requireModuleAccess("Exams", "VIEW", exam.classId);
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const examSubjects = await sdb.examSubject.findMany({ where: { examId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } });
  const classStudents = await sdb.student.findMany({ where: { classId: exam.classId, status: "ACTIVE" }, orderBy: [{ firstName: "asc" }, { surname: "asc" }] });
  if (classStudents.length === 0) return NextResponse.json({ error: "No active students in this class." }, { status: 404 });

  const marks = await sdb.mark.findMany({ where: { examSubjectId: { in: examSubjects.map((es) => es.id) }, studentId: { in: classStudents.map((s) => s.id) } } });
  const marksByStudent = new Map<string, Map<string, { obtained: number | null; isAbsent: boolean }>>();
  for (const m of marks) {
    const map = marksByStudent.get(m.studentId) ?? new Map();
    map.set(m.examSubjectId, { obtained: m.marksObtained !== null ? Number(m.marksObtained) : null, isAbsent: m.isAbsent });
    marksByStudent.set(m.studentId, map);
  }

  // Total/max/pct/grade/rank come from the persisted StudentResult (see
  // lib/domain/exam-results.ts) rather than being re-derived here, so a
  // student with nothing entered shows "—" instead of silently scoring 0
  // — this used to be a third independent (and buggy) copy of that logic.
  const results = await sdb.studentResult.findMany({ where: { examId } });
  const resultByStudent = new Map(results.map((r) => [r.studentId, r]));
  const outOf = results.length;

  const className = `${exam.class.grade}-${exam.class.section}`;

  let rows: ReportCardStudent[] = classStudents.map((st) => {
    const map = marksByStudent.get(st.id) ?? new Map();
    const result = resultByStudent.get(st.id);
    return {
      name: studentName(st),
      admissionNo: st.admissionNo,
      className,
      subjects: examSubjects.map((es) => {
        const entry = map.get(es.id);
        return { name: es.subject.name, obtained: entry && !entry.isAbsent ? entry.obtained : null, isAbsent: entry?.isAbsent ?? false, max: es.maxMarks };
      }),
      total: result ? Number(result.totalMarks) : null,
      maxTotal: result ? Number(result.maxMarks) : null,
      pct: result ? Number(result.percentage) : null,
      grade: result?.grade ?? null,
      resultStatus: result?.resultStatus ?? null,
      rank: result?.rank ?? null,
      outOf,
    };
  });

  if (studentId) {
    rows = rows.filter((_, i) => classStudents[i].id === studentId);
    if (rows.length === 0) return NextResponse.json({ error: "Student not found in this class." }, { status: 404 });
  }

  const examDates = `${exam.startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${exam.endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  const schoolAddress = [exam.school.addressLine, exam.school.city, exam.school.state].filter(Boolean).join(", ");

  const buffer = await renderToBuffer(ReportCardDocument({ schoolName: exam.school.name, schoolAddress, examName: exam.name, examDates, students: rows }));

  const fileName = studentId
    ? `Report-Card-${rows[0].name.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`
    : `Report-Cards-${exam.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${className}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "private, no-store" },
  });
}
