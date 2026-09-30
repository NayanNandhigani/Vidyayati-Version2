"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { promoteStudent } from "@/lib/domain/enrollment";
import { applyFeePlan, generateInstalmentsForClass, regenerateInstalmentsForGrade, type FeePlanTerm, type InstalmentPlanResult } from "@/lib/fee-instalments";

async function requireAdmin() {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can manage the institute.");
}

// Attendance access for a class is tied to actually teaching it — being the
// class teacher or a co-teacher — rather than a general school-wide toggle;
// see setClassTeacher/createClass here and addCoTeacher/removeCoTeacher in
// depth-actions.ts, all of which call these two to keep StaffPermission in
// sync whenever a class's teachers change.
export async function grantClassAttendanceAccess(sdb: Awaited<ReturnType<typeof getScopedDb>>, staffId: string, classId: string) {
  await sdb.staffPermission.upsert({
    where: { staffId_moduleName_classId: { staffId, moduleName: "Attendance", classId } },
    update: { accessLevel: "EDIT" },
    create: scopedCreateData<Prisma.StaffPermissionUncheckedCreateInput>({ staffId, moduleName: "Attendance", classId, accessLevel: "EDIT" }),
  });
}

export async function revokeClassAttendanceAccess(sdb: Awaited<ReturnType<typeof getScopedDb>>, staffId: string, classId: string) {
  await sdb.staffPermission.deleteMany({ where: { staffId, moduleName: "Attendance", classId } });
}

export type FormState = { error?: string; success?: boolean };

const NUMERIC_GRADE = /^(1[0-2]|[1-9])$/;
const DEFAULT_GRADE_LABELS = new Set(["LKG", "UKG", "NURSERY", "PRE-KG", "KG"]);
const SECTION_PATTERN = /^[A-Za-z0-9]{1,5}$/;

async function validateGrade(sdb: Awaited<ReturnType<typeof getScopedDb>>, yearId: string, grade: string): Promise<string | null> {
  if (NUMERIC_GRADE.test(grade)) return null;
  if (DEFAULT_GRADE_LABELS.has(grade.toUpperCase())) return null;
  const configured = await sdb.academicGrade.findUnique({ where: { yearId_name: { yearId, name: grade } } });
  if (configured) return null;
  return `"${grade}" isn't a valid grade — use 1-12 or a configured label (e.g. LKG, UKG, Nursery — set these in Academic Management).`;
}

export async function createClass(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const sdb = await getScopedDb();

  const grade = formData.get("grade");
  const section = formData.get("section");
  const classTeacherStaffId = formData.get("classTeacherStaffId");

  if (typeof grade !== "string" || !grade.trim() || typeof section !== "string" || !section.trim()) {
    return { error: "Grade and section are required." };
  }
  if (!SECTION_PATTERN.test(section.trim())) {
    return { error: "Section must be letters/numbers only, up to 5 characters." };
  }

  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true } });
  if (!currentYear) return { error: "Set an active academic year in Settings first." };

  const gradeTrim = grade.trim();
  const gradeError = await validateGrade(sdb, currentYear.id, gradeTrim);
  if (gradeError) return { error: gradeError };
  const sectionTrim = section.trim().toUpperCase();

  const existing = await sdb.class.findFirst({ where: { yearId: currentYear.id, grade: gradeTrim, section: sectionTrim } });
  if (existing) return { error: `Class ${gradeTrim}-${sectionTrim} already exists.` };

  const newTeacherStaffId = typeof classTeacherStaffId === "string" && classTeacherStaffId ? classTeacherStaffId : null;
  if (newTeacherStaffId) await sdb.staffProfile.findUniqueOrThrow({ where: { id: newTeacherStaffId }, select: { id: true } });
  const newClass = await sdb.class.create({
    data: scopedCreateData<Prisma.ClassUncheckedCreateInput>({
      yearId: currentYear.id,
      grade: gradeTrim,
      section: sectionTrim,
      classTeacherStaffId: newTeacherStaffId,
    }),
  });
  if (newTeacherStaffId) await grantClassAttendanceAccess(sdb, newTeacherStaffId, newClass.id);

  revalidatePath("/app/institute");
  return { success: true };
}

export async function setClassTeacher(classId: string, staffId: string | null) {
  await requireAdmin();
  const sdb = await getScopedDb();
  const existing = await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { classTeacherStaffId: true } });
  if (staffId) await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { id: true } });
  await sdb.class.update({ where: { id: classId }, data: { classTeacherStaffId: staffId } });

  if (existing.classTeacherStaffId && existing.classTeacherStaffId !== staffId) {
    const stillCoTeacher = await sdb.classCoTeacher.findUnique({ where: { classId_staffId: { classId, staffId: existing.classTeacherStaffId } } });
    if (!stillCoTeacher) await revokeClassAttendanceAccess(sdb, existing.classTeacherStaffId, classId);
  }
  if (staffId) await grantClassAttendanceAccess(sdb, staffId, classId);

  revalidatePath("/app/institute");
  revalidatePath("/app/timetable");
  revalidatePath("/app/attendance");
}

export async function deleteClass(classId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const sdb = await getScopedDb();

  const [students, exams, homework, timetableSlots, feeStructures, subjectTeachers] = await Promise.all([
    sdb.student.count({ where: { classId } }),
    sdb.exam.count({ where: { classId } }),
    sdb.homework.count({ where: { classId } }),
    sdb.timetableSlot.count({ where: { classId } }),
    sdb.feeStructure.count({ where: { classId } }),
    sdb.classSubjectTeacher.count({ where: { classId } }),
  ]);

  const blockers: string[] = [];
  if (students > 0) blockers.push(`${students} student${students === 1 ? "" : "s"}`);
  if (exams > 0) blockers.push(`${exams} exam${exams === 1 ? "" : "s"}`);
  if (homework > 0) blockers.push(`${homework} homework item${homework === 1 ? "" : "s"}`);
  if (timetableSlots > 0) blockers.push(`${timetableSlots} timetable slot${timetableSlots === 1 ? "" : "s"}`);
  if (feeStructures > 0) blockers.push(`${feeStructures} fee structure${feeStructures === 1 ? "" : "s"}`);
  if (subjectTeachers > 0) blockers.push(`${subjectTeachers} subject mapping${subjectTeachers === 1 ? "" : "s"}`);

  if (blockers.length > 0) {
    return { error: `Cannot delete — this class still has ${blockers.join(", ")}.` };
  }

  await sdb.class.delete({ where: { id: classId } });
  revalidatePath("/app/institute");
  return {};
}

export async function createSubject(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const sdb = await getScopedDb();

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) return { error: "Subject name is required." };
  const nameTrim = name.trim();

  const existing = await sdb.subject.findFirst({ where: { name: { equals: nameTrim, mode: "insensitive" } } });
  if (existing) return { error: `${nameTrim} already exists.` };

  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true } });
  const classes = currentYear ? await sdb.class.findMany({ where: { yearId: currentYear.id } }) : [];

  const subject = await sdb.subject.create({ data: scopedCreateData<Prisma.SubjectUncheckedCreateInput>({ name: nameTrim }) });

  const assignments = classes
    .map((c) => ({ classId: c.id, staffId: formData.get(`teacher_${c.id}`) }))
    .filter((a): a is { classId: string; staffId: string } => typeof a.staffId === "string" && a.staffId.length > 0);

  if (assignments.length > 0) {
    // staffId comes straight from client form data — validate every one
    // belongs to this school before it's attached to the new subject.
    const validStaff = await sdb.staffProfile.findMany({ where: { id: { in: assignments.map((a) => a.staffId) } }, select: { id: true } });
    const validStaffIds = new Set(validStaff.map((s) => s.id));
    const validAssignments = assignments.filter((a) => validStaffIds.has(a.staffId));
    if (validAssignments.length > 0) {
      await sdb.classSubjectTeacher.createMany({
        data: validAssignments.map((a) => scopedCreateData<Prisma.ClassSubjectTeacherUncheckedCreateInput>({ classId: a.classId, subjectId: subject.id, staffId: a.staffId })),
      });
    }
  }

  revalidatePath("/app/institute");
  return { success: true };
}

export async function deleteSubject(subjectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const sdb = await getScopedDb();

  const [timetableSlots, examSubjects, homework, classAssignments] = await Promise.all([
    sdb.timetableSlot.count({ where: { subjectId } }),
    sdb.examSubject.count({ where: { subjectId } }),
    sdb.homework.count({ where: { subjectId } }),
    sdb.classSubjectTeacher.count({ where: { subjectId } }),
  ]);

  if (timetableSlots + examSubjects + homework + classAssignments > 0) {
    return { error: "This subject is in use (timetable, exams, homework, or class mapping) — remove those first." };
  }

  await sdb.subject.delete({ where: { id: subjectId } });
  revalidatePath("/app/institute");
  return {};
}

function assertWholeNonNegative(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    throw new Error(`${label} must be a whole number ≥ 0.`);
  }
}

export async function setClassFeeDefault(grade: string, actualFee: number) {
  await requireAdmin();
  assertWholeNonNegative(actualFee, "Actual fee");
  const sdb = await getScopedDb();
  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true } });
  if (!currentYear) throw new Error("Set an active academic year in Settings first.");
  await sdb.classFeeDefault.upsert({
    where: { yearId_grade: { yearId: currentYear.id, grade } },
    update: { actualFee },
    create: scopedCreateData<Prisma.ClassFeeDefaultUncheckedCreateInput>({ yearId: currentYear.id, grade, actualFee }),
  });
  // Students without their own charged fee are billed from this figure, so
  // their instalments must follow it.
  await regenerateInstalmentsForGrade(sdb, currentYear.id, grade);
  revalidatePath("/app/institute");
  revalidatePath("/app/fees");
  revalidatePath("/app/admissions");
  revalidatePath("/app/students");
}

export type FeeInstalmentPlanTerm = FeePlanTerm;

// Saves a grade's instalment plan (applied to every section/class in that
// grade for the current year, since FeeStructure is keyed by classId but
// the admin thinks in terms of a grade) and immediately regenerates every
// active student's FeeInstalment rows from it. Never overwrites or removes
// an instalment that already has a payment — see lib/fee-instalments.ts.
// Returns problems as { error } rather than throwing: Next.js hides thrown
// server-action messages in production, so the admin would only see a
// generic failure.
export async function saveFeeInstalmentPlan(grade: string, head: string, terms: FeeInstalmentPlanTerm[]): Promise<InstalmentPlanResult | { error: string }> {
  await requireAdmin();
  const trimmedHead = head.trim() || "Tuition";
  if (terms.length === 0) return { error: "Add at least one instalment term." };
  for (const t of terms) {
    if (!t.term.trim()) return { error: "Every instalment needs a term name." };
    if (!Number.isFinite(t.amount) || t.amount < 0 || !Number.isInteger(t.amount)) return { error: `${t.term.trim()} amount must be a whole number of 0 or more.` };
    if (!t.dueDate || Number.isNaN(Date.parse(t.dueDate))) return { error: `${t.term.trim()} needs a valid due date.` };
  }

  const sdb = await getScopedDb();
  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true } });
  if (!currentYear) return { error: "Set an active academic year in Settings first." };

  const result = await applyFeePlan(sdb, currentYear.id, grade, trimmedHead, terms);

  revalidatePath("/app/institute");
  revalidatePath("/app/fees");
  revalidatePath("/app/students");
  revalidatePath("/app/admissions");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports");

  return result;
}

export async function setClassSubjectTeacher(classId: string, subjectId: string, staffId: string | null) {
  await requireAdmin();
  const sdb = await getScopedDb();

  // classId/subjectId/staffId are client-supplied — the create branch below
  // doesn't go through a schoolId-filtered where clause the way an update
  // does, so a cross-tenant id would otherwise slip straight into a create.
  // These lookups throw (tenant-scoped, so a foreign id 404s) before that
  // can happen.
  await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { id: true } });
  await sdb.subject.findUniqueOrThrow({ where: { id: subjectId }, select: { id: true } });
  if (staffId) await sdb.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { id: true } });

  if (!staffId) {
    await sdb.classSubjectTeacher.deleteMany({ where: { classId, subjectId } });
  } else {
    await sdb.classSubjectTeacher.upsert({
      where: { classId_subjectId: { classId, subjectId } },
      update: { staffId },
      create: scopedCreateData<Prisma.ClassSubjectTeacherUncheckedCreateInput>({ classId, subjectId, staffId }),
    });
  }

  revalidatePath("/app/institute");
}

export async function getClassesForYear(yearId: string) {
  await requireAdmin();
  const sdb = await getScopedDb();
  const classes = await sdb.class.findMany({ where: { yearId }, orderBy: [{ grade: "asc" }, { section: "asc" }] });
  return classes.map((c) => ({ id: c.id, grade: c.grade, section: c.section }));
}

export async function getActiveStudentsInClass(classId: string) {
  await requireAdmin();
  const sdb = await getScopedDb();
  const students = await sdb.student.findMany({ where: { classId, status: "ACTIVE" }, orderBy: [{ firstName: "asc" }, { surname: "asc" }] });
  return students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.surname}`.trim() }));
}

/**
 * Promotes every ACTIVE student in a class to the next grade for a target
 * academic year in one go, except any in `heldBackStudentIds` — those go
 * to `holdBackClassId` instead (typically the same grade, next year, i.e.
 * repeating it). Updates Student.classId directly (promoteStudent's own
 * Enrollment bookkeeping doesn't touch it — see its doc comment) and
 * leaves fee history exactly where it is: unpaid FeeInstalment rows stay
 * tied to the student, not the class, so pending fees are carried forward
 * as arrears automatically, with no separate "arrears" concept needed.
 */
export async function bulkPromoteClass(
  sourceClassId: string,
  promoteToClassId: string,
  holdBackClassId: string,
  heldBackStudentIds: string[]
): Promise<{ promoted: number; heldBack: number }> {
  await requireAdmin();
  const sdb = await getScopedDb();

  const students = await sdb.student.findMany({ where: { classId: sourceClassId, status: "ACTIVE" }, select: { id: true } });
  const heldBack = new Set(heldBackStudentIds);

  let promotedCount = 0;
  let heldBackCount = 0;
  for (const student of students) {
    const destination = heldBack.has(student.id) ? holdBackClassId : promoteToClassId;
    await sdb.$transaction(async (tx) => {
      await promoteStudent(student.id, destination, "PROMOTED", tx);
      await tx.student.update({ where: { id: student.id }, data: { classId: destination } });
    });
    if (heldBack.has(student.id)) heldBackCount += 1;
    else promotedCount += 1;
  }

  // Bill the new class's fee plan straight away (a no-op if that class has
  // no plan yet — saving one later generates them). The previous year's
  // unpaid instalments are left alone as arrears.
  const destinations = await sdb.class.findMany({ where: { id: { in: Array.from(new Set([promoteToClassId, holdBackClassId])) } }, select: { id: true, yearId: true } });
  for (const cls of destinations) await generateInstalmentsForClass(sdb, cls.id, cls.yearId);

  revalidatePath("/app/institute");
  revalidatePath("/app/students");
  revalidatePath("/app/fees");
  return { promoted: promotedCount, heldBack: heldBackCount };
}
