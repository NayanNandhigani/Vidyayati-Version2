import type { ScopedDb } from "@/lib/tenant-db";

/**
 * QA fix 2.4: there used to be two independent admission-number schemes
 * (a plain student count in the New Student "Suggest" button, and a
 * separate hardcoded "AD-2000+count" in the admissions admit flow) —
 * neither honoured Settings → "Admission number prefix", and neither
 * looked at the highest number actually in use, so both could (and did)
 * collide with or fall behind real data. This is the one place both now
 * call: next number = highest existing numeric suffix across every
 * admissionNo in the school (regardless of what prefix it was created
 * under — a school-wide sequence, not one per prefix) + 1, formatted
 * with the school's current prefix.
 */
export async function nextAdmissionNumber(sdb: ScopedDb, schoolId: string): Promise<string> {
  const [school, students] = await Promise.all([
    sdb.school.findUnique({ where: { id: schoolId }, select: { admissionNoPrefix: true } }),
    sdb.student.findMany({ select: { admissionNo: true } }),
  ]);
  const prefix = school?.admissionNoPrefix?.trim() || "STU";

  let highest = 0;
  for (const s of students) {
    const match = s.admissionNo.match(/(\d+)\s*$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  return `${prefix}-${String(highest + 1).padStart(4, "0")}`;
}
