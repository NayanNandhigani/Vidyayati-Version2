import Link from "next/link";
import { formatIST } from "@/lib/ist";
import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess, getPermittedClassIds } from "@/lib/permissions";
import { daysUntil, studentName } from "@/lib/format";
import { gradeFor, gradeForScale, gradeColor } from "@/lib/academic";
import { hasFeature } from "@/lib/feature-flags";
import { getSeating, canViewExamResults } from "./depth-actions";
import ExamMarksGrid from "./ExamMarksGrid";
import ExamDepthPanel from "./ExamDepthPanel";
import ExamPicker from "./ExamPicker";
import ScheduleExamPanel from "./ScheduleExamPanel";
import ReportCardPanel from "./ReportCardPanel";
import HallTicketPanel from "./HallTicketPanel";
import { calculateExamResults } from "@/lib/domain/exam-results";
import { unassignedMessage, unassignedSubjects } from "@/lib/subject-assignments";
import { evaluateStudent, resultLabel, type MarkCell } from "@/lib/exam-rules";

// Results computed before this date used the old rules (partial entries
// scored and ranked, ties ranked apart) and are recalculated on open.
const EXAM_RULES_SINCE = new Date("2026-10-01T00:00:00Z");

const TABS = ["schedule", "grades", "report-card", "hall-ticket"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { schedule: "Schedule Exam", grades: "Grades", "report-card": "Report Card", "hall-ticket": "Hall Ticket" };

const APPROVAL_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: "var(--warn-tint)", fg: "var(--warn)", label: "Pending approval" },
  APPROVED: { bg: "var(--good-tint)", fg: "var(--good)", label: "Approved" },
  REJECTED: { bg: "var(--critical-tint)", fg: "var(--critical)", label: "Rejected" },
};

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ tab?: string; exam?: string; classId?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const sdb = await getScopedDb();

  if (session!.user.role === "PARENT") {
    return <ParentExamsView />;
  }

  // Same reasoning as Attendance/Students: a class-scoped staffer with no
  // school-wide row must still reach this page — only reject up front when
  // they have no permitted classes at all.
  // Reads that don't depend on each other run together (QA BUG-28) — this
  // page used to make ~19 database round trips one after another.
  const [permittedClassIds, currentYear, school, showSeating, showResultRelease, rooms, allSubjects] = await Promise.all([
    getPermittedClassIds("Exams", "VIEW"),
    sdb.academicYear.findFirst({ where: { isCurrent: true }, include: { gradeScale: { include: { bands: true } } } }),
    sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { resultsLockUntilFeesCleared: true, examFailLabel: true } }),
    hasFeature(session!.user.schoolId, "exams.seatingAndBulkMarks"),
    hasFeature(session!.user.schoolId, "exams.resultRelease"),
    sdb.room.findMany({ orderBy: { name: "asc" } }),
    sdb.subject.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (permittedClassIds !== "ALL" && permittedClassIds.size === 0) {
    await requireModuleAccess("Exams", "VIEW");
  }

  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "schedule";

  const gradeBands = currentYear?.gradeScale?.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })) ?? [];
  const gradeForPct = (pct: number) => gradeForScale(pct, gradeBands) ?? gradeFor(pct);
  const examsRaw = currentYear
    ? await sdb.exam.findMany({ where: { yearId: currentYear.id }, include: { class: true }, orderBy: { startDate: "asc" } })
    : [];
  const exams = permittedClassIds === "ALL" ? examsRaw : examsRaw.filter((e) => permittedClassIds.has(e.classId));

  const now = new Date();
  const selectedExam = exams.find((e) => e.id === params.exam) ?? exams.find((e) => e.endDate >= now) ?? exams[exams.length - 1];

  const classId = params.classId ?? selectedExam?.classId ?? "";
  // Unlike Attendance's classId (near-always populated via a class picker),
  // selectedExam only exists once an exam has already been created — a
  // school's very first visit to this page, before scheduling anything,
  // has no selectedExam. Falling back to "NONE" there (as if the user had
  // no access) hid the "+ Schedule Exam" button behind a chicken-and-egg
  // deadlock for every school. Resolve the school-wide grant instead
  // (still correctly "EDIT" for a School Admin, or a staff member's real
  // school-wide StaffPermission row, or "NONE" if they truly have none).
  const accessLevel = await requireModuleAccess("Exams", "VIEW", selectedExam?.classId);
  const canEdit = accessLevel === "EDIT";
  const isSchoolAdmin = session!.user.role === "SCHOOL_ADMIN";

  const [examSubjects, students, marks, storedResults, seating] = await Promise.all([
    selectedExam
      ? sdb.examSubject.findMany({ where: { examId: selectedExam.id }, include: { subject: true }, orderBy: { subject: { name: "asc" } } })
      : Promise.resolve([]),
    classId
      ? sdb.student.findMany({ where: { classId, status: "ACTIVE" }, orderBy: [{ firstName: "asc" }, { surname: "asc" }], select: { id: true, firstName: true, surname: true, admissionNo: true } })
      : Promise.resolve([]),
    // Same rows as "marks of the students listed above", without waiting for that list first.
    selectedExam && classId ? sdb.mark.findMany({ where: { examSubject: { examId: selectedExam.id }, student: { classId, status: "ACTIVE" } } }) : Promise.resolve([]),
    selectedExam ? sdb.studentResult.findMany({ where: { examId: selectedExam.id } }) : Promise.resolve([]),
    selectedExam && showSeating ? getSeating(selectedExam.id) : Promise.resolve([]),
  ]);
  const initialMarks: Record<string, Record<string, number | "AB">> = {};
  for (const m of marks) {
    initialMarks[m.studentId] = initialMarks[m.studentId] ?? {};
    initialMarks[m.studentId][m.examSubjectId] = m.isAbsent ? "AB" : Number(m.marksObtained);
  }


  const examOptions = exams.map((e) => ({ id: e.id, classId: e.classId, label: `${e.name} · Class ${e.class.grade}-${e.class.section}` }));

  // Report Card rows — total/percentage/grade/rank per student. Reads the
  // persisted StudentResult (computed by lib/domain/exam-results.ts right
  // after every saveMarks) rather than re-deriving totals inline here, so
  // this panel, the downloadable PDF, and the Dashboard's exam-average
  // tile can never disagree the way they used to (a student with no marks
  // used to get silently scored 0 and ranked/graded alongside everyone
  // else). A student with no StudentResult row — nothing entered for them
  // yet — shows "—" rather than being scored as zero or omitted.
  // Results calculated before the shared rules (lib/exam-rules.ts) existed
  // are recalculated the first time the exam is opened.
  let results = storedResults;
  if (selectedExam && results.some((r) => r.computedAt < EXAM_RULES_SINCE)) {
    await calculateExamResults(selectedExam.id);
    results = await sdb.studentResult.findMany({ where: { examId: selectedExam.id } });
  }
  const failLabel = school?.examFailLabel ?? null;
  const resultByStudent = new Map(results.map((r) => [r.studentId, r]));
  const subjectSpecs = examSubjects.map((es) => ({ id: es.id, maxMarks: es.maxMarks, passMarks: es.passMarks }));
  const reportCardRows = students.map((s) => {
    const r = resultByStudent.get(s.id);
    if (!r) {
      const cells: Record<string, MarkCell> = {};
      for (const [esId, v] of Object.entries(initialMarks[s.id] ?? {})) cells[esId] = v === "AB" ? { obtained: null, absent: true } : { obtained: v, absent: false };
      const ev = evaluateStudent(subjectSpecs, cells);
      const status = ev.status === "INCOMPLETE" ? `Incomplete (${ev.entered} of ${ev.of})` : "Not entered";
      return { id: s.id, name: studentName(s), total: null, maxTotal: null, pct: null, grade: null, resultStatus: null, resultLabel: null, rank: null, status };
    }
    const pct = Number(r.percentage);
    const passed = r.resultStatus !== "FAIL";
    return { id: s.id, name: studentName(s), total: Number(r.totalMarks), maxTotal: Number(r.maxMarks), pct, grade: r.grade ?? gradeForPct(pct), resultStatus: r.resultStatus, resultLabel: resultLabel(passed, failLabel), rank: r.rank, status: null };
  });

  // An exam scheduled before subject assignments were enforced may include
  // a subject the class doesn't study per Academic Management → Subjects.
  const unassigned = selectedExam ? await unassignedSubjects(sdb, selectedExam.classId, examSubjects.map((es) => es.subjectId)) : [];
  const unassignedWarning = unassigned.length && selectedExam ? unassignedMessage(`${selectedExam.class.grade}-${selectedExam.class.section}`, unassigned) : null;

  const hallTicketRows = students.map((s) => ({ id: s.id, name: studentName(s), admissionNo: s.admissionNo }));

  const tabHref = (t: Tab) => `/app/exams?tab=${t}${selectedExam ? `&exam=${selectedExam.id}&classId=${selectedExam.classId}` : ""}`;

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 14, height: "var(--page-h)", boxSizing: "border-box", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="disp" style={{ fontSize: 21 }}>
          Exams {currentYear && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--faint)" }}>· {currentYear.label}</span>}
        </div>
        {canEdit && tab === "schedule" && (
          <Link href="/app/exams/new" style={{ background: "var(--marigold)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            + Schedule Exam
          </Link>
        )}
      </div>

      <div className="m-tabs" style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
        {TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            style={{ padding: "10px 2px", marginRight: 26, fontSize: 13.5, fontWeight: tab === t ? 700 : 600, color: tab === t ? "var(--ink)" : "var(--muted)", borderBottom: tab === t ? "2px solid var(--marigold)" : "2px solid transparent", textDecoration: "none" }}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </div>

      {exams.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          No exams scheduled yet for {currentYear?.label ?? "this year"}.
        </div>
      ) : tab === "schedule" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, exams.length)},1fr)`, gap: 13 }}>
            {exams.map((e) => {
              const isSelected = e.id === selectedExam?.id;
              const completed = e.endDate < now;
              const upcoming = e.startDate > now;
              const approval = APPROVAL_PILL[e.approvalStatus];
              return (
                <Link
                  key={e.id}
                  href={`/app/exams?tab=schedule&exam=${e.id}&classId=${e.classId}`}
                  className="card"
                  style={{
                    padding: "13px 17px",
                    textDecoration: "none",
                    color: "inherit",
                    border: isSelected ? "2px solid var(--marigold)" : "1px solid var(--line)",
                    background: isSelected ? "var(--marigold-tint)" : "var(--card)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.name}</div>
                    <span
                      className="pill"
                      style={
                        completed
                          ? { background: "var(--good-tint)", color: "var(--good)" }
                          : upcoming
                            ? { background: "var(--marigold-tint)", color: "var(--marigold-deep)" }
                            : { background: "var(--line)", color: "var(--faint)" }
                      }
                    >
                      {completed ? "Completed" : upcoming ? `Upcoming · ${daysUntil(e.startDate)}d` : "Ongoing"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 4, fontWeight: 600 }}>
                    {formatIST(e.startDate, { day: "2-digit", month: "short" })} – {formatIST(e.endDate, { day: "2-digit", month: "short", year: "numeric" })} · Class {e.class.grade}-{e.class.section}
                  </div>
                  <span className="pill" style={{ background: approval.bg, color: approval.fg, marginTop: 6, display: "inline-block" }}>
                    {approval.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {selectedExam && (
            <ScheduleExamPanel
              examId={selectedExam.id}
              examName={selectedExam.name}
              startDate={selectedExam.startDate.toISOString().slice(0, 10)}
              endDate={selectedExam.endDate.toISOString().slice(0, 10)}
              classLabel={`${selectedExam.class.grade}-${selectedExam.class.section}`}
              approvalStatus={selectedExam.approvalStatus}
              isSchoolAdmin={isSchoolAdmin}
              canEdit={canEdit}
              examSubjects={examSubjects.map((es) => ({ id: es.id, subjectId: es.subjectId, name: es.subject.name, maxMarks: es.maxMarks, passMarks: es.passMarks }))}
              allSubjects={allSubjects}
            />
          )}
          {selectedExam && (
            <ExamDepthPanel
              examId={selectedExam.id}
              canEdit={canEdit}
              showSeating={showSeating}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
              seating={seating}
              showResultRelease={showResultRelease}
              resultReleaseAt={selectedExam.resultReleaseAt?.toISOString() ?? null}
              feeLockEnabled={school?.resultsLockUntilFeesCleared ?? false}
            />
          )}
        </>
      ) : tab === "grades" ? (
        <>
          <ExamPicker exams={examOptions} selectedExamId={selectedExam?.id ?? null} tab="grades" />
          {unassignedWarning && <div className="card" style={{ padding: "10px 16px", fontSize: 12.5, color: "var(--warn)", fontWeight: 600 }}>{unassignedWarning}</div>}
          {selectedExam ? (
            <ExamMarksGrid
              examId={selectedExam.id}
              examName={selectedExam.name}
              className={`${selectedExam.class.grade}-${selectedExam.class.section}`}
              students={students}
              examSubjects={examSubjects}
              initialMarks={initialMarks}
              canEdit={canEdit}
              gradeBands={gradeBands}
              failLabel={failLabel}
            />
          ) : (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
              Select an exam to enter marks.
            </div>
          )}
        </>
      ) : tab === "report-card" ? (
        <>
          <ExamPicker exams={examOptions} selectedExamId={selectedExam?.id ?? null} tab="report-card" />
          {selectedExam ? (
            <ReportCardPanel examId={selectedExam.id} examApproved={selectedExam.approvalStatus === "APPROVED"} rows={reportCardRows} />
          ) : (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
              Select an exam to view report cards.
            </div>
          )}
        </>
      ) : (
        <>
          <ExamPicker exams={examOptions} selectedExamId={selectedExam?.id ?? null} tab="hall-ticket" />
          {selectedExam ? (
            <HallTicketPanel examId={selectedExam.id} examApproved={selectedExam.approvalStatus === "APPROVED"} rows={hallTicketRows} />
          ) : (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
              Select an exam to generate hall tickets.
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function ParentExamsView() {
  const session = await auth();
  const sdb = await getScopedDb();

  const parent = await sdb.parent.findUnique({
    where: { userId: session!.user.id },
    include: {
      studentLinks: {
        include: {
          student: {
            include: {
              class: true,
              marks: { include: { examSubject: { include: { exam: true, subject: true } } } },
            },
          },
        },
      },
    },
  });

  const students = parent?.studentLinks.map((l) => l.student) ?? [];

  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true }, include: { gradeScale: { include: { bands: true } } } });
  const gradeBands = currentYear?.gradeScale?.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })) ?? [];
  const gradeForPct = (pct: number) => gradeForScale(pct, gradeBands) ?? gradeFor(pct);

  // Precompute per-exam visibility (release date / fee lock) before
  // rendering — canViewExamResults is async, so this can't happen inline
  // inside a .map() callback in the JSX below.
  // Same rules as everywhere else (lib/exam-rules.ts): a complete result
  // comes from StudentResult; an exam with only some subjects entered is
  // shown as incomplete, never scored over the subjects that happen to be in.
  const failLabel = (await sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { examFailLabel: true } }))?.examFailLabel ?? null;
  const resultsByStudent = await Promise.all(
    students.map(async (s) => {
      const stored = await sdb.studentResult.findMany({ where: { studentId: s.id }, include: { exam: true } });
      const storedByExam = new Map(stored.map((r) => [r.examId, r]));
      const examsWithMarks = new Map<string, { name: string; date: Date }>();
      for (const m of s.marks) examsWithMarks.set(m.examSubject.exam.id, { name: m.examSubject.exam.name, date: m.examSubject.exam.startDate });
      for (const r of stored) examsWithMarks.set(r.examId, { name: r.exam.name, date: r.exam.startDate });
      const raw = [...examsWithMarks.entries()]
        .map(([examId, e]) => {
          const r = storedByExam.get(examId);
          return r
            ? { examId, name: e.name, date: e.date, total: Number(r.totalMarks), max: Number(r.maxMarks), pct: Number(r.percentage), grade: r.grade ?? gradeForPct(Number(r.percentage)), result: resultLabel(r.resultStatus !== "FAIL", failLabel) }
            : { examId, name: e.name, date: e.date, total: null, max: null, pct: null, grade: null, result: null };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      const results = await Promise.all(raw.map(async (r) => ({ ...r, ...(await canViewExamResults(r.examId, s.id)) })));
      return { student: s, results };
    })
  );

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="disp" style={{ fontSize: 21 }}>
        Exam Results
      </div>
      {students.length === 0 && <div style={{ color: "var(--muted)" }}>No students linked to your account.</div>}
      {resultsByStudent.map(({ student: s, results }) => (
        <div key={s.id} className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 14 }}>
            {studentName(s)} <span style={{ fontWeight: 500, fontSize: 12.5, color: "var(--muted)" }}>· Class {s.class.grade}-{s.class.section}</span>
          </div>
          {results.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No exam results recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r) => {
                if (!r.visible) {
                  return (
                    <div key={r.name + r.date.toISOString()} style={{ padding: "10px 12px", background: "var(--paper)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--warn)", marginTop: 2 }}>{r.reason}</div>
                    </div>
                  );
                }
                if (r.pct === null) {
                  return (
                    <div key={r.name + r.date.toISOString()} style={{ padding: "10px 12px", background: "var(--paper)", borderRadius: 8, display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: "var(--muted)" }}>Results not complete yet</span>
                    </div>
                  );
                }
                return (
                  <div key={r.name + r.date.toISOString()} className="m-row" style={{ display: "grid", gridTemplateColumns: "1.7fr 0.9fr 0.6fr auto", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--paper)", borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{r.result}</div>
                    </div>
                    <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>
                      {r.total} / {r.max}
                    </div>
                    <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: gradeColor(r.grade!) }}>
                      {Math.round(r.pct)}%
                    </div>
                    <span className="pill" style={{ background: "var(--paper)", color: gradeColor(r.grade!), border: "1px solid var(--line)" }}>
                      {r.grade}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
