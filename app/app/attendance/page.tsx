import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess, getPermittedClassIds } from "@/lib/permissions";
import { studentName } from "@/lib/format";
import { hasFeature } from "@/lib/feature-flags";
import { attendancePercent } from "@/lib/attendance";
import { parseDateOnly, todayIST } from "@/lib/ist";
import { getAttendanceFlags } from "./depth-actions";
import AttendanceFilters from "./AttendanceFilters";
import AttendanceRoster from "./AttendanceRoster";
import StaffAttendanceRoster from "./StaffAttendanceRoster";
import AttendanceViewToggle from "./AttendanceViewToggle";
import LeaveRequestsPanel from "./LeaveRequestsPanel";
import AttendanceFlagsPanel from "./AttendanceFlagsPanel";
import ParentLeaveForm from "./ParentLeaveForm";


export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ classId?: string; date?: string; view?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const sdb = await getScopedDb();

  if (session!.user.role === "PARENT") {
    return <ParentAttendanceView />;
  }

  const isAdmin = session!.user.role === "SCHOOL_ADMIN";
  const today = todayIST();
  const date = params.date && parseDateOnly(params.date) ? params.date : today;
  const dateValue = parseDateOnly(date)!;

  // Staff attendance is its own admin-only roster, entirely separate from
  // the per-class student view below — feeds the Dashboard staff tiles,
  // each employee's Attendance tab, and Reports → Staff Attendance, none
  // of which had any way to get real data before this.
  if (params.view === "staff" && isAdmin) {
    const [staff, existingStaffAttendance] = await Promise.all([
      sdb.staffProfile.findMany({ include: { user: true }, orderBy: { user: { name: "asc" } } }),
      sdb.staffAttendance.findMany({ where: { date: dateValue } }),
    ]);
    const initialStaffMarks: Record<string, "PRESENT" | "ABSENT" | "HALF_DAY"> = {};
    for (const a of existingStaffAttendance) initialStaffMarks[a.staffId] = a.status;

    return (
      <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 16, height: "100dvh", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <AttendanceViewToggle view="staff" date={date} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <StaffAttendanceRoster key={date} date={date} today={today} staff={staff.map((s) => ({ id: s.id, name: s.user.name }))} initialMarks={initialStaffMarks} />
        </div>
      </div>
    );
  }

  // A staffer scoped to specific classes (no school-wide row) still needs
  // to reach this page — requireModuleAccess() with no classId would
  // incorrectly reject them, since it only resolves the school-wide grant.
  // Attendance access is tied to actually teaching a class (class teacher
  // or co-teacher — see setClassTeacher/addCoTeacher in the Academic
  // Management module), not a general permission toggle, so a Staff
  // session with no class assignment at all is a normal, expected state
  // now — show a plain explanation instead of throwing to the generic
  // error boundary.
  // Independent reads run together (QA BUG-28).
  const [permittedClassIds, classesRaw, showLeaveWorkflow, showFlags] = await Promise.all([
    getPermittedClassIds("Attendance", "VIEW"),
    sdb.class.findMany({ orderBy: [{ grade: "asc" }, { section: "asc" }] }),
    hasFeature(session!.user.schoolId, "attendance.studentLeave"),
    hasFeature(session!.user.schoolId, "attendance.defaulterAlerts"),
  ]);
  if (session!.user.role === "STAFF" && permittedClassIds !== "ALL" && permittedClassIds.size === 0) {
    return (
      <div style={{ padding: "26px 34px" }}>
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 6 }}>No class assigned to you yet</div>
          <div style={{ fontSize: 13 }}>
            Attendance is only visible to a class's teacher or co-teacher. Ask your School Admin to assign you in Academic Management → Classes &amp; Sections.
          </div>
        </div>
      </div>
    );
  }

  const classes = permittedClassIds === "ALL" ? classesRaw : classesRaw.filter((c) => permittedClassIds.has(c.id));
  const classId = params.classId ?? classes[0]?.id ?? "";

  // Resolve actual per-class access — a staffer can have EDIT on one class
  // and only VIEW (or none) on another. Throws if classId itself isn't
  // permitted at all (e.g. a manipulated ?classId=), consistent with how
  // insufficient access is handled elsewhere in this codebase.
  const classFilter = permittedClassIds === "ALL" ? {} : { classId: { in: [...permittedClassIds] } };
  const [accessLevel, students, existing, reqs, flags, school] = await Promise.all([
    classId ? requireModuleAccess("Attendance", "VIEW", classId) : Promise.resolve("NONE" as const),
    classId
      ? sdb.student.findMany({
          where: { classId, status: "ACTIVE" },
          orderBy: [{ firstName: "asc" }, { surname: "asc" }],
          select: { id: true, firstName: true, surname: true, admissionNo: true },
        })
      : Promise.resolve([]),
    // The day's marks for this class's active students, without waiting for the student list first.
    classId ? sdb.attendance.findMany({ where: { date: dateValue, student: { classId, status: "ACTIVE" } } }) : Promise.resolve([]),
    showLeaveWorkflow
      ? sdb.studentLeaveRequest.findMany({
          where: { stage: { in: ["PENDING", "CLASS_TEACHER_APPROVED"] }, student: classFilter },
          include: { student: { include: { class: true } } },
          orderBy: { requestedAt: "desc" },
        })
      : Promise.resolve([]),
    showFlags ? getAttendanceFlags() : Promise.resolve({ defaulters: [], consecutiveAbsentees: [] }),
    showFlags ? sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { attendanceDefaulterThresholdPct: true, consecutiveAbsenceAlertDays: true } }) : Promise.resolve(null),
  ]);
  const canEdit = accessLevel === "EDIT";
  const initialMarks: Record<string, "PRESENT" | "ABSENT" | "HALF_DAY"> = {};
  for (const a of existing) initialMarks[a.studentId] = a.status;

  let leaveRequests: { id: string; studentName: string; className: string; dateFrom: string; dateTo: string; reason: string; stage: "PENDING" | "CLASS_TEACHER_APPROVED" | "ADMIN_APPROVED" | "REJECTED"; rejectionNote: string | null }[] = [];
  if (showLeaveWorkflow) {
    leaveRequests = reqs.map((r) => ({
      id: r.id,
      studentName: `${r.student.firstName} ${r.student.surname}`,
      className: `${r.student.class.grade}-${r.student.class.section}`,
      dateFrom: r.dateFrom.toISOString(),
      dateTo: r.dateTo.toISOString(),
      reason: r.reason,
      stage: r.stage,
      rejectionNote: r.rejectionNote,
    }));
  }


  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 16, height: "100dvh", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {isAdmin ? <AttendanceViewToggle view="students" date={date} /> : <div />}
        <AttendanceFilters classes={classes} classId={classId} date={date} today={today} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <AttendanceRoster key={`${classId}:${date}`} classId={classId} date={date} today={today} students={students} initialMarks={initialMarks} canEdit={canEdit} />
        {showLeaveWorkflow && <LeaveRequestsPanel requests={leaveRequests} isAdmin={isAdmin} canActAsClassTeacher={canEdit} />}
        {showFlags && (
          <AttendanceFlagsPanel
            defaulters={flags.defaulters}
            consecutiveAbsentees={flags.consecutiveAbsentees}
            isAdmin={isAdmin}
            defaulterPct={school?.attendanceDefaulterThresholdPct ?? null}
            consecutiveDays={school?.consecutiveAbsenceAlertDays ?? null}
          />
        )}
      </div>
    </div>
  );
}

async function ParentAttendanceView() {
  const session = await auth();
  const sdb = await getScopedDb();
  const showLeave = await hasFeature(session!.user.schoolId, "attendance.studentLeave");

  const parent = await sdb.parent.findUnique({
    where: { userId: session!.user.id },
    include: {
      studentLinks: {
        include: {
          student: {
            include: { class: true, attendance: { orderBy: { date: "desc" }, take: 30 } },
          },
        },
      },
    },
  });

  const students = parent?.studentLinks.map((l) => l.student) ?? [];
  const leaveByStudent = new Map<string, { id: string; dateFrom: string; dateTo: string; reason: string; stage: string; rejectionNote: string | null }[]>();
  if (showLeave) {
    for (const s of students) {
      const reqs = await sdb.studentLeaveRequest.findMany({ where: { studentId: s.id }, orderBy: { requestedAt: "desc" } });
      leaveByStudent.set(
        s.id,
        reqs.map((r) => ({ id: r.id, dateFrom: r.dateFrom.toISOString(), dateTo: r.dateTo.toISOString(), reason: r.reason, stage: r.stage, rejectionNote: r.rejectionNote }))
      );
    }
  }

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="disp" style={{ fontSize: 21 }}>
        Attendance
      </div>
      {students.length === 0 && <div style={{ color: "var(--muted)" }}>No students linked to your account.</div>}
      {students.map((s) => {
        const counts = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0 };
        for (const a of s.attendance) counts[a.status] += 1;
        const pct = attendancePercent(counts);
        return (
          <div key={s.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{studentName(s)}</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--teal)" }}>
                {pct === null ? "No data" : `${pct}% present`}
              </div>
            </div>
            {s.attendance.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No attendance recorded yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 6 }}>
                {[...s.attendance].reverse().map((a, i) => {
                  const style =
                    a.status === "PRESENT"
                      ? { bg: "var(--good-tint)", fg: "var(--good)", mark: "P" }
                      : a.status === "ABSENT"
                        ? { bg: "var(--critical-tint)", fg: "var(--critical)", mark: "A" }
                        : { bg: "var(--warn-tint)", fg: "var(--warn)", mark: "H" };
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderRadius: 6, padding: "7px 0", background: style.bg, color: style.fg }}>
                      <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                        {a.date.getDate()}
                      </span>
                      <span style={{ fontSize: 8, fontWeight: 700 }}>{style.mark}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {showLeave && <ParentLeaveForm studentId={s.id} requests={leaveByStudent.get(s.id) ?? []} />}
          </div>
        );
      })}
    </div>
  );
}
