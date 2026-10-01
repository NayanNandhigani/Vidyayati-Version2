import { Prisma, type AttendanceStatus } from "@prisma/client";
import type { ScopedDb } from "./tenant-db";

// Saving a class's attendance used to run one upsert per student. Each
// upsert also went through the audit extension (a read before, the write,
// an audit insert), so a class of 28 took ~84 sequential database round
// trips — about 10 seconds against the hosted database. These helpers save
// the whole sheet in one transaction with a fixed number of queries: one
// read, one bulk insert, at most one bulk update per status, and one bulk
// audit insert carrying the same before/after entries the per-row path
// wrote, so the Audit Log reads exactly as before.

type Mark = { id: string; status: AttendanceStatus };

export async function saveStudentAttendanceBatch(
  sdb: ScopedDb,
  opts: { schoolId: string; actorUserId?: string; classId: string; date: Date; marks: Mark[]; markedByStaffId: string | null }
): Promise<number> {
  const { classId, date, marks, markedByStaffId } = opts;
  if (marks.length === 0) return 0;
  return sdb.$transaction(async (tx) => {
    const existing = await tx.attendance.findMany({ where: { date, studentId: { in: marks.map((m) => m.id) } } });
    const byStudent = new Map(existing.map((e) => [e.studentId, e]));
    const toCreate = marks.filter((m) => !byStudent.has(m.id));
    const changed = marks.filter((m) => {
      const e = byStudent.get(m.id);
      return e && (e.status !== m.status || e.classId !== classId || e.markedByStaffId !== markedByStaffId);
    });

    const created = toCreate.length
      ? await tx.attendance.createManyAndReturn({
          data: toCreate.map((m) => ({ schoolId: opts.schoolId, studentId: m.id, date, status: m.status, classId, markedByStaffId })),
          select: { id: true },
        })
      : [];

    const byStatus = new Map<AttendanceStatus, string[]>();
    for (const m of changed) byStatus.set(m.status, [...(byStatus.get(m.status) ?? []), byStudent.get(m.id)!.id]);
    for (const [status, ids] of byStatus) {
      await tx.attendance.updateMany({ where: { id: { in: ids } }, data: { status, classId, markedByStaffId } });
    }

    const audit: Prisma.MutationAuditLogCreateManyInput[] = [
      ...created.map((c) => ({ schoolId: opts.schoolId, actorUserId: opts.actorUserId ?? null, action: "CREATE" as const, entityType: "Attendance", entityId: c.id, changes: Prisma.JsonNull })),
      ...changed.map((m) => {
        const before = byStudent.get(m.id)!;
        const changes: Record<string, { before: string; after: string }> = {};
        if (before.status !== m.status) changes.status = { before: before.status, after: m.status };
        if (before.classId !== classId) changes.classId = { before: String(before.classId), after: classId };
        if (before.markedByStaffId !== markedByStaffId) changes.markedByStaffId = { before: String(before.markedByStaffId), after: String(markedByStaffId) };
        return { schoolId: opts.schoolId, actorUserId: opts.actorUserId ?? null, action: "UPDATE" as const, entityType: "Attendance", entityId: before.id, changes };
      }),
    ];
    if (audit.length) await tx.mutationAuditLog.createMany({ data: audit });
    return marks.length;
  });
}

export async function saveStaffAttendanceBatch(sdb: ScopedDb, opts: { schoolId: string; actorUserId?: string; date: Date; marks: Mark[] }): Promise<number> {
  const { date, marks } = opts;
  if (marks.length === 0) return 0;
  return sdb.$transaction(async (tx) => {
    const existing = await tx.staffAttendance.findMany({ where: { date, staffId: { in: marks.map((m) => m.id) } } });
    const byStaff = new Map(existing.map((e) => [e.staffId, e]));
    const toCreate = marks.filter((m) => !byStaff.has(m.id));
    const changed = marks.filter((m) => byStaff.has(m.id) && byStaff.get(m.id)!.status !== m.status);

    const created = toCreate.length
      ? await tx.staffAttendance.createManyAndReturn({ data: toCreate.map((m) => ({ schoolId: opts.schoolId, staffId: m.id, date, status: m.status })), select: { id: true } })
      : [];
    const byStatus = new Map<AttendanceStatus, string[]>();
    for (const m of changed) byStatus.set(m.status, [...(byStatus.get(m.status) ?? []), byStaff.get(m.id)!.id]);
    for (const [status, ids] of byStatus) await tx.staffAttendance.updateMany({ where: { id: { in: ids } }, data: { status } });

    const audit: Prisma.MutationAuditLogCreateManyInput[] = [
      ...created.map((c) => ({ schoolId: opts.schoolId, actorUserId: opts.actorUserId ?? null, action: "CREATE" as const, entityType: "StaffAttendance", entityId: c.id, changes: Prisma.JsonNull })),
      ...changed.map((m) => {
        const before = byStaff.get(m.id)!;
        return { schoolId: opts.schoolId, actorUserId: opts.actorUserId ?? null, action: "UPDATE" as const, entityType: "StaffAttendance", entityId: before.id, changes: { status: { before: before.status, after: m.status } } };
      }),
    ];
    if (audit.length) await tx.mutationAuditLog.createMany({ data: audit });
    return marks.length;
  });
}
