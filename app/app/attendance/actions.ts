"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getScopedDb } from "@/lib/tenant-db";
import { runAction } from "@/lib/action-result";
import { formatDateIST, isFutureDateIST, parseDateOnly, todayISTDate } from "@/lib/ist";
import { saveStaffAttendanceBatch, saveStudentAttendanceBatch } from "@/lib/attendance-save";
import { requireModuleAccess } from "@/lib/permissions";

const STATUSES = new Set<AttendanceStatus>(["PRESENT", "ABSENT", "HALF_DAY"]);

/** The attendance date must be a real date and not after today in India. */
function checkAttendanceDate(date: string): { date: Date } | { error: string } {
  const d = parseDateOnly(date);
  if (!d) return { error: "Pick a valid date." };
  if (isFutureDateIST(date)) return { error: `You can't mark attendance for a future date. Today is ${formatDateIST(todayISTDate())}.` };
  return { date: d };
}

function cleanMarks(marks: Record<string, AttendanceStatus>) {
  return Object.entries(marks)
    .filter(([, status]) => STATUSES.has(status))
    .map(([id, status]) => ({ id, status }));
}

/** Admin-only, daily, for every staff member — feeds the Dashboard staff tiles, each employee's Attendance tab, and Reports → Staff Attendance. */
export async function saveStaffAttendance(date: string, marks: Record<string, AttendanceStatus>): Promise<{ error?: string; savedCount?: number }> {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") return { error: "Only a School Admin can mark staff attendance." };
  const checked = checkAttendanceDate(date);
  if ("error" in checked) return { error: checked.error };

  return runAction(async () => {
    const sdb = await getScopedDb();
    const requested = cleanMarks(marks);
    const validStaff = await sdb.staffProfile.findMany({ where: { id: { in: requested.map((m) => m.id) } }, select: { id: true } });
    const validIds = new Set(validStaff.map((s) => s.id));
    const savedCount = await saveStaffAttendanceBatch(sdb, { schoolId: session!.user.schoolId!, actorUserId: session!.user.id, date: checked.date, marks: requested.filter((m) => validIds.has(m.id)) });

    revalidatePath("/app/attendance");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/reports");
    return { savedCount };
  }, "saveStaffAttendance");
}

/** Saves a class's attendance sheet for one date in a single batched transaction. Future dates (IST) are refused. */
export async function saveAttendance(classId: string, date: string, marks: Record<string, AttendanceStatus>): Promise<{ error?: string; success?: boolean; savedCount?: number }> {
  await requireModuleAccess("Attendance", "EDIT", classId);
  const checked = checkAttendanceDate(date);
  if ("error" in checked) return { error: checked.error };
  const session = await auth();

  return runAction(async () => {
    const sdb = await getScopedDb();
    const staffProfile = session!.user.role === "STAFF" ? await db.staffProfile.findUnique({ where: { userId: session!.user.id }, select: { id: true } }) : null;

    // studentId keys come from the browser — only students actually in
    // this class (and school) are written.
    const requested = cleanMarks(marks);
    const validStudents = await sdb.student.findMany({ where: { classId, id: { in: requested.map((m) => m.id) } }, select: { id: true } });
    const validIds = new Set(validStudents.map((s) => s.id));

    const savedCount = await saveStudentAttendanceBatch(sdb, {
      schoolId: session!.user.schoolId!,
      actorUserId: session!.user.id,
      classId,
      date: checked.date,
      marks: requested.filter((m) => validIds.has(m.id)),
      markedByStaffId: staffProfile?.id ?? null,
    });

    revalidatePath("/app/attendance");
    revalidatePath("/app/dashboard");
    return { success: true, savedCount };
  }, "saveAttendance");
}
