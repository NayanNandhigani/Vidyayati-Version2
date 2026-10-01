import type { Prisma } from "@prisma/client";
import { scopedCreateData, type ScopedDb } from "./tenant-db";

/**
 * Submission rows are created for the students in a class when homework is
 * set, so a student who joins later had none and the class looked smaller
 * than it is (0/26 for a class of 28). This adds the missing rows for the
 * class's current active students; it never removes or changes existing
 * ones (a student who left keeps their history, but isn't counted).
 */
export async function syncHomeworkRosters(sdb: ScopedDb, homework: { id: string; classId: string }[]): Promise<void> {
  if (homework.length === 0) return;
  const classIds = [...new Set(homework.map((h) => h.classId))];
  const [students, existing] = await Promise.all([
    sdb.student.findMany({ where: { classId: { in: classIds }, status: "ACTIVE" }, select: { id: true, classId: true } }),
    sdb.homeworkSubmission.findMany({ where: { assignmentId: { in: homework.map((h) => h.id) } }, select: { assignmentId: true, studentId: true } }),
  ]);
  const have = new Set(existing.map((e) => `${e.assignmentId}:${e.studentId}`));
  const missing = homework.flatMap((h) =>
    students.filter((st) => st.classId === h.classId && !have.has(`${h.id}:${st.id}`)).map((st) => ({ assignmentId: h.id, studentId: st.id }))
  );
  if (missing.length > 0) {
    await sdb.homeworkSubmission.createMany({ data: missing.map((m) => scopedCreateData<Prisma.HomeworkSubmissionUncheckedCreateInput>(m)), skipDuplicates: true });
  }
}
