import type { ScopedDb } from "./tenant-db";

// Which subjects a class studies is defined in exactly one place:
// Academic Management → Subjects (ClassSubjectTeacher rows: class +
// subject + teacher). Exams and the timetable check against it, so a
// subject can't be examined or timetabled for a class that the Subjects
// screen says doesn't study it (QA BUG-18).

export async function assignedSubjectIds(sdb: ScopedDb, classId: string): Promise<Set<string>> {
  const rows = await sdb.classSubjectTeacher.findMany({ where: { classId }, select: { subjectId: true } });
  return new Set(rows.map((r) => r.subjectId));
}

/** The subjects in `subjectIds` that aren't assigned to the class, with names, for a message. */
export async function unassignedSubjects(sdb: ScopedDb, classId: string, subjectIds: string[]): Promise<{ id: string; name: string }[]> {
  if (subjectIds.length === 0) return [];
  const assigned = await assignedSubjectIds(sdb, classId);
  const missing = subjectIds.filter((id) => !assigned.has(id));
  if (missing.length === 0) return [];
  return sdb.subject.findMany({ where: { id: { in: missing } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export function unassignedMessage(className: string, subjects: { name: string }[]): string {
  const names = subjects.map((s) => s.name).join(", ");
  return `${names} ${subjects.length === 1 ? "isn't" : "aren't"} assigned to Class ${className}. Assign ${subjects.length === 1 ? "it" : "them"} (with a subject teacher) in Academic Management → Subjects first, so every screen agrees on what this class studies.`;
}
