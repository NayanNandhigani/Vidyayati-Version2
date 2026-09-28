"use server";

import { revalidatePath } from "next/cache";
import { Prisma, AttendanceStatus } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";

/** Admin-only, daily, for every staff member — feeds the Dashboard staff tiles, each employee's Attendance tab, and Reports → Staff Attendance, none of which had a write path before this. */
export async function saveStaffAttendance(date: string, marks: Record<string, AttendanceStatus>): Promise<{ error?: string; savedCount?: number }> {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") return { error: "Only a School Admin can mark staff attendance." };
  const sdb = await getScopedDb();

  const validStaff = await sdb.staffProfile.findMany({ where: { id: { in: Object.keys(marks) } }, select: { id: true } });
  const validStaffIds = new Set(validStaff.map((s) => s.id));
  const validMarks = Object.entries(marks).filter(([staffId]) => validStaffIds.has(staffId));

  const d = new Date(`${date}T00:00:00`);
  await sdb.$transaction(
    validMarks.map(([staffId, status]) =>
      sdb.staffAttendance.upsert({
        where: { staffId_date: { staffId, date: d } },
        update: { status },
        create: scopedCreateData<Prisma.StaffAttendanceUncheckedCreateInput>({ staffId, date: d, status }),
      })
    )
  );

  revalidatePath("/app/attendance");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports");
  return { savedCount: validMarks.length };
}

export async function saveAttendance(classId: string, date: string, marks: Record<string, AttendanceStatus>) {
  await requireModuleAccess("Attendance", "EDIT", classId);
  const session = await auth();
  const sdb = await getScopedDb();

  const staffProfile =
    session!.user.role === "STAFF" ? await db.staffProfile.findUnique({ where: { userId: session!.user.id } }) : null;

  const d = new Date(`${date}T00:00:00`);

  // studentId keys come from client-submitted marks — restrict writes to
  // students who actually belong to this class/school.
  const validStudents = await sdb.student.findMany({ where: { classId, id: { in: Object.keys(marks) } }, select: { id: true } });
  const validStudentIds = new Set(validStudents.map((s) => s.id));
  const validMarks = Object.entries(marks).filter(([studentId]) => validStudentIds.has(studentId));

  await sdb.$transaction(
    validMarks.map(([studentId, status]) =>
      sdb.attendance.upsert({
        where: { studentId_date: { studentId, date: d } },
        update: { status, markedByStaffId: staffProfile?.id ?? null, classId },
        create: scopedCreateData<Prisma.AttendanceUncheckedCreateInput>({
          studentId,
          date: d,
          status,
          markedByStaffId: staffProfile?.id ?? null,
          classId,
        }),
      })
    )
  );

  revalidatePath("/app/attendance");
  return { success: true, savedCount: validMarks.length };
}
