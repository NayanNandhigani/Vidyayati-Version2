import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess, getPermittedClassIds } from "@/lib/permissions";
import { formatDate, studentName } from "@/lib/format";
import { subjectStyleFor } from "@/lib/academic";
import { hasFeature } from "@/lib/feature-flags";
import { getTeacherWorkload } from "./depth-actions";
import TimetableFilter from "./TimetableFilter";
import TimetableGrid from "./TimetableGrid";
import RoomsPanel from "./RoomsPanel";
import type { DayOfWeek } from "@prisma/client";
import { assignedSubjectIds } from "@/lib/subject-assignments";

function todayColumn() {
  const day = new Date().getDay(); // 0=Sun..6=Sat
  return day === 0 ? -1 : day - 1; // Mon=0..Sat=5, Sunday has no column
}

async function buildGrid(sdb: Awaited<ReturnType<typeof getScopedDb>>, classId: string) {
  const slots = await sdb.timetableSlot.findMany({ where: { classId }, include: { subject: true, staff: { include: { user: true } }, room: true } });
  const grid: Record<number, Partial<Record<DayOfWeek, { subjectId: string; subjectName: string; staffId: string; staffName: string; roomId: string | null; roomName: string | null }>>> = {};
  for (const slot of slots) {
    grid[slot.periodNo] = grid[slot.periodNo] ?? {};
    grid[slot.periodNo]![slot.dayOfWeek] = {
      subjectId: slot.subjectId,
      subjectName: slot.subject.name,
      staffId: slot.staffId,
      staffName: slot.staff.user.name,
      roomId: slot.roomId,
      roomName: slot.room?.name ?? null,
    };
  }
  return grid;
}

// A teacher's week across every class. Cells reuse the class grid's shape,
// with the class name where the teacher name would go. An overridden clash
// can put two classes in one cell, so those are joined rather than dropped.
async function buildTeacherGrid(sdb: Awaited<ReturnType<typeof getScopedDb>>, staffId: string, permittedClassIds: "ALL" | Set<string>) {
  const slots = await sdb.timetableSlot.findMany({ where: { staffId }, include: { subject: true, class: true, room: true }, orderBy: [{ class: { grade: "asc" } }, { class: { section: "asc" } }] });
  const grid: Record<number, Partial<Record<DayOfWeek, { subjectId: string; subjectName: string; staffId: string; staffName: string; roomId: string | null; roomName: string | null }>>> = {};
  for (const slot of slots) {
    if (permittedClassIds !== "ALL" && !permittedClassIds.has(slot.classId)) continue;
    const label = `Class ${slot.class.grade}-${slot.class.section}`;
    grid[slot.periodNo] = grid[slot.periodNo] ?? {};
    const existing = grid[slot.periodNo]![slot.dayOfWeek];
    grid[slot.periodNo]![slot.dayOfWeek] = existing
      ? { ...existing, subjectName: existing.subjectName === slot.subject.name ? existing.subjectName : `${existing.subjectName} / ${slot.subject.name}`, staffName: `${existing.staffName} + ${label} (clash)` }
      : { subjectId: slot.subjectId, subjectName: slot.subject.name, staffId, staffName: label, roomId: slot.roomId, roomName: slot.room?.name ?? null };
  }
  return { grid, periodCount: slots.length };
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ classId?: string; teacherId?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const sdb = await getScopedDb();

  if (session!.user.role === "PARENT") {
    return <ParentTimetableView />;
  }

  const permittedClassIds = await getPermittedClassIds("Timetable", "VIEW");
  const noClassAccess = permittedClassIds !== "ALL" && permittedClassIds.size === 0;

  const [classesRaw, subjects, staff, showRooms, rooms, workload] = await Promise.all([
    sdb.class.findMany({ orderBy: [{ grade: "asc" }, { section: "asc" }], include: { classTeacher: { include: { user: true } } } }),
    sdb.subject.findMany({ orderBy: { name: "asc" } }),
    sdb.staffProfile.findMany({ where: { deletedAt: null }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    hasFeature(session!.user.schoolId, "timetable.roomsAndConflicts"),
    sdb.room.findMany({ orderBy: { name: "asc" } }),
    getTeacherWorkload(),
  ]);
  const classes = permittedClassIds === "ALL" ? classesRaw : classesRaw.filter((c) => permittedClassIds.has(c.id));

  // Teacher view: a staffer can always see their own week in full; anyone
  // else's is limited to the classes this session may view.
  const ownStaff = session!.user.role === "STAFF" ? staff.find((s) => s.userId === session!.user.id) : undefined;
  // With no class access at all, a teacher can still see their own week;
  // anyone else without access is refused as before.
  if (noClassAccess && !ownStaff) {
    await requireModuleAccess("Timetable", "VIEW");
  }
  const requestedTeacherId = noClassAccess ? ownStaff!.id : params.teacherId;
  const teacherId = requestedTeacherId && staff.some((s) => s.id === requestedTeacherId) ? requestedTeacherId : undefined;
  if (teacherId) {
    const teacher = staff.find((s) => s.id === teacherId)!;
    const { grid: teacherGrid, periodCount } = await buildTeacherGrid(sdb, teacherId, teacherId === ownStaff?.id ? "ALL" : permittedClassIds);
    return (
      <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 13, height: "100dvh", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="disp" style={{ fontSize: 21 }}>
              Timetable · {teacher.user.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {periodCount} period{periodCount === 1 ? "" : "s"} a week · {formatDate(new Date())}
            </div>
          </div>
          <TimetableFilter classes={classes} classId="" teachers={staff.map((s) => ({ id: s.id, name: s.user.name }))} teacherId={teacherId} ownTeacherId={ownStaff?.id ?? null} classTeacherName={null} />
        </div>
        <div className="card" style={{ padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <DayHeader />
          <TimetableGrid key={teacherId} classId="" grid={teacherGrid} subjects={subjects} staff={[]} todayCol={todayColumn()} canEdit={false} rooms={[]} showRooms={false} />
        </div>
      </div>
    );
  }

  const classId = params.classId ?? classes[0]?.id ?? "";
  const selectedClass = classes.find((c) => c.id === classId);
  const grid = classId ? await buildGrid(sdb, classId) : {};

  // Per-class access — a staffer can have EDIT on one class's timetable and
  // only VIEW (or none) on another.
  const accessLevel = classId ? await requireModuleAccess("Timetable", "VIEW", classId) : "NONE";
  const canEdit = accessLevel === "EDIT";
  // The cell editor only offers subjects this class studies (Academic
  // Management → Subjects); the server enforces the same rule.
  const assignedIds = classId ? await assignedSubjectIds(sdb, classId) : new Set<string>();
  const classSubjects = subjects.filter((sub) => assignedIds.has(sub.id));

  return (
    <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 13, height: "100dvh", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="disp" style={{ fontSize: 21 }}>
            Timetable
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{formatDate(new Date())}</div>
        </div>
        <TimetableFilter classes={classes} classId={classId} teachers={staff.map((s) => ({ id: s.id, name: s.user.name }))} teacherId={null} ownTeacherId={ownStaff?.id ?? null} classTeacherName={selectedClass?.classTeacher?.user.name ?? null} />
      </div>

      <div className="card" style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}>
        {subjects.map((s) => (
          <span key={s.id}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: subjectStyleFor(s.name).fg, marginRight: 5 }} />
            {s.name}
          </span>
        ))}
      </div>

      {showRooms && (
        <div className="card" style={{ padding: "12px 18px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <RoomsPanel rooms={rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, equipmentNote: r.equipmentNote }))} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 6 }}>
              Teacher workload (periods/week)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 100, overflowY: "auto" }}>
              {workload.slice(0, 6).map((w) => (
                <div key={w.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                  <span>{w.name}</span>
                  <span className="mono" style={{ fontWeight: 700, color: w.count > 30 ? "var(--critical)" : "var(--muted)" }}>{w.count}</span>
                </div>
              ))}
              {workload.length === 0 && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>No slots scheduled yet.</div>}
            </div>
          </div>
        </div>
      )}

      {canEdit && classId && classSubjects.length === 0 && (
        <div className="card" style={{ padding: "10px 16px", fontSize: 12.5, color: "var(--warn)", fontWeight: 600 }}>
          No subjects are assigned to this class yet. Assign them in Academic Management → Subjects, then they can be added to the timetable.
        </div>
      )}
      <div className="card" style={{ padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "84px repeat(6,1fr)", borderBottom: "1px solid var(--line)", flex: "none" }}>
          <div style={{ padding: "9px 12px", fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", borderRight: "1px solid var(--line)" }}>Period</div>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <div
              key={d}
              style={{
                padding: "9px 0",
                textAlign: "center",
                fontSize: 12.5,
                fontWeight: 700,
                borderRight: i === 5 ? "none" : "1px solid var(--line)",
                color: i === todayColumn() ? "var(--marigold-deep)" : "var(--ink)",
              }}
            >
              {d} {i === todayColumn() && <span className="mono" style={{ fontSize: 9.5, fontWeight: 600 }}>· Today</span>}
            </div>
          ))}
        </div>
        {classId ? (
          <TimetableGrid
            key={classId}
            classId={classId}
            grid={grid}
            subjects={classSubjects}
            staff={staff.map((s) => ({ id: s.id, name: s.user.name }))}
            todayCol={todayColumn()}
            canEdit={canEdit}
            rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
            showRooms={showRooms}
          />
        ) : (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No classes set up yet.</div>
        )}
      </div>
    </div>
  );
}

function DayHeader() {
  const today = todayColumn();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "84px repeat(6,1fr)", borderBottom: "1px solid var(--line)", flex: "none" }}>
      <div style={{ padding: "9px 12px", fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", borderRight: "1px solid var(--line)" }}>Period</div>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
        <div key={d} style={{ padding: "9px 0", textAlign: "center", fontSize: 12.5, fontWeight: 700, borderRight: i === 5 ? "none" : "1px solid var(--line)", color: i === today ? "var(--marigold-deep)" : "var(--ink)" }}>
          {d} {i === today && <span className="mono" style={{ fontSize: 9.5, fontWeight: 600 }}>· Today</span>}
        </div>
      ))}
    </div>
  );
}

async function ParentTimetableView() {
  const session = await auth();
  const sdb = await getScopedDb();

  const parent = await sdb.parent.findUnique({
    where: { userId: session!.user.id },
    include: { studentLinks: { include: { student: { include: { class: true } } } } },
  });
  const student = parent?.studentLinks[0]?.student;

  if (!student) {
    return (
      <div style={{ padding: "26px 34px" }}>
        <div className="disp" style={{ fontSize: 21, marginBottom: 12 }}>
          Timetable
        </div>
        <div style={{ color: "var(--muted)" }}>No students linked to your account.</div>
      </div>
    );
  }

  const [subjects, grid] = await Promise.all([sdb.subject.findMany({ orderBy: { name: "asc" } }), buildGrid(sdb, student.classId)]);

  return (
    <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 13, height: "100dvh", boxSizing: "border-box" }}>
      <div className="disp" style={{ fontSize: 21 }}>
        Timetable · {studentName(student)} · Class {student.class.grade}-{student.class.section}
      </div>
      <div className="card" style={{ padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "84px repeat(6,1fr)", borderBottom: "1px solid var(--line)", flex: "none" }}>
          <div style={{ padding: "9px 12px", fontSize: 10, color: "var(--faint)", textTransform: "uppercase" }}>Period</div>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ padding: "9px 0", textAlign: "center", fontSize: 12.5, fontWeight: 700 }}>
              {d}
            </div>
          ))}
        </div>
        <TimetableGrid classId={student.classId} grid={grid} subjects={subjects} staff={[]} todayCol={todayColumn()} canEdit={false} rooms={[]} showRooms={false} />
      </div>
    </div>
  );
}
