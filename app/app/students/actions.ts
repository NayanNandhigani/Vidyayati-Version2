"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { enrollStudent, promoteStudent } from "@/lib/domain/enrollment";
import { generateInstalmentsForStudent } from "@/lib/fee-instalments";
import type { StudentStatus } from "@prisma/client";
import { runAction, UserError } from "@/lib/action-result";
import { parseStudentDetails, type StudentDetails, type StudentDetailErrors } from "@/lib/student-fields";

export type CreateStudentResult = { studentId?: string; error?: string; fieldErrors?: StudentDetailErrors };

/**
 * Adds a student. Validation runs here (the form's own checks are only a
 * convenience); problems come back per field so the form can show them
 * next to the input without losing anything typed.
 */
export async function createStudent(details: StudentDetails, admissionNoRaw: string, classId: string): Promise<CreateStudentResult> {
  const fieldErrors: StudentDetailErrors = {};
  const admissionNo = (admissionNoRaw ?? "").trim();
  if (!admissionNo) fieldErrors.admissionNo = "Enter an admission number (or use Suggest).";
  else if (admissionNo.length > 40) fieldErrors.admissionNo = "Admission number is too long (40 characters at most).";
  if (!classId) fieldErrors.classId = "Pick a class.";
  const parsed = parseStudentDetails(details);
  if (parsed.errors) Object.assign(fieldErrors, parsed.errors);
  if (Object.keys(fieldErrors).length > 0 || !parsed.data) return { error: "Please fix the highlighted fields.", fieldErrors };

  await requireModuleAccess("Students", "EDIT", classId);
  const result = await runAction(async () => {
    const sdb = await getScopedDb();
    const cls = await sdb.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!cls) throw new UserError("That class no longer exists. Please pick another.", { classId: "Pick a class." });

    const session = await auth();
    const school = await db.school.findUnique({ where: { id: session!.user.schoolId! }, select: { maxStudents: true } });
    if (school?.maxStudents != null) {
      const activeCount = await sdb.student.count({ where: { status: "ACTIVE" } });
      if (activeCount >= school.maxStudents) throw new UserError(`This school's student limit (${school.maxStudents}) has been reached. Contact Vidya Yati to raise it.`);
    }

    // Admission numbers are unique across the whole school (not per class).
    const clash = await sdb.student.findFirst({ where: { admissionNo: { equals: admissionNo, mode: "insensitive" } }, include: { class: true } });
    if (clash) {
      const msg = `Admission number "${admissionNo}" is already used in this school by ${clash.firstName} ${clash.surname} (Class ${clash.class.grade}-${clash.class.section}). Admission numbers must be unique across the whole school.`;
      throw new UserError(msg, { admissionNo: msg });
    }

    const student = await sdb.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: scopedCreateData<Prisma.StudentUncheckedCreateInput>({ ...parsed.data, admissionNo, classId }),
      });
      await enrollStudent(created.id, classId, parsed.rollNumber ?? undefined, tx);
      return created;
    });
    return { studentId: student.id };
  }, "createStudent");

  if (result.ok !== true) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/app/students");
  return { studentId: result.studentId };
}

// The client already asks the admin to confirm before calling this — see
// the confirm() gate in StudentFeeAllocationPanel — since it changes this
// student's recorded scholarship (the class's actual fee, from Academic
// Management → Fee Structure, minus this charged fee).
export async function updateStudentChargedFee(studentId: string, chargedFee: number | null) {
  return runAction(async () => {
    const session = await auth();
    if (session!.user.role !== "SCHOOL_ADMIN") throw new UserError("Only a School Admin can change a student's charged fee.");
    const sdb = await getScopedDb();

    if (chargedFee != null && (!Number.isFinite(chargedFee) || chargedFee < 0 || !Number.isInteger(chargedFee))) {
      throw new UserError("Charged fee must be a whole number ≥ 0.");
    }

    const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { classId: true } });
    const cls = await sdb.class.findUniqueOrThrow({ where: { id: student.classId }, select: { grade: true, yearId: true } });
    const feeDefault = await sdb.classFeeDefault.findUnique({ where: { yearId_grade: { yearId: cls.yearId, grade: cls.grade } } });
    if (chargedFee != null && feeDefault && chargedFee > Number(feeDefault.actualFee)) {
      throw new UserError("Charged fee can't be more than the actual fee.");
    }

    await sdb.student.update({ where: { id: studentId }, data: { chargedFee } });
    await generateInstalmentsForStudent(sdb, studentId, student.classId, cls.yearId);
    revalidatePath(`/app/students/${studentId}`);
    revalidatePath("/app/fees");
  }, "updateStudentChargedFee");
}

/** Edits a student's details — everything but class/status/guardians, which are their own actions below. An empty Aadhaar field keeps the number already on file (it's never sent to the browser). */
export async function updateStudentProfile(studentId: string, details: StudentDetails): Promise<{ error?: string; fieldErrors?: StudentDetailErrors }> {
  await requireModuleAccess("Students", "EDIT");
  const parsed = parseStudentDetails(details, { keepAadhaarWhenEmpty: true });
  if (parsed.errors || !parsed.data) return { error: "Please fix the highlighted fields.", fieldErrors: parsed.errors ?? {} };

  const result = await runAction(async () => {
    const sdb = await getScopedDb();
    const student = await sdb.student.findUnique({ where: { id: studentId }, select: { classId: true, class: { select: { yearId: true } } } });
    if (!student) throw new UserError("This student no longer exists. Please refresh the page.");
    await sdb.$transaction(async (tx) => {
      await tx.student.update({ where: { id: studentId }, data: parsed.data });
      const enrollment = await tx.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: student.class.yearId } } });
      if (enrollment) await tx.enrollment.update({ where: { id: enrollment.id }, data: { rollNumber: parsed.rollNumber } });
    });
    return {};
  }, "updateStudentProfile");
  if (result.error) return { error: result.error };

  revalidatePath(`/app/students/${studentId}`);
  return {};
}

const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = { ACTIVE: "Active", ALUMNI: "Alumni", TRANSFERRED: "Transferred-out", INACTIVE: "Inactive" };

export async function changeStudentStatus(studentId: string, status: StudentStatus, transferOutDate: string | null): Promise<{ error?: string; warning?: string }> {
  await requireModuleAccess("Students", "EDIT");
  const sdb = await getScopedDb();

  if (status === "TRANSFERRED" && !transferOutDate) return { error: "A transfer-out date is required." };

  await sdb.student.update({
    where: { id: studentId },
    data: { status, transferOutDate: status === "TRANSFERRED" ? new Date(transferOutDate!) : null },
  });

  revalidatePath(`/app/students/${studentId}`);
  revalidatePath("/app/students");
  return { warning: `Status changed to ${STUDENT_STATUS_LABEL[status]}.` };
}

/** Moves a student to a different section/class — same academic year (a reshuffle) or a different one (promoteStudent closes the old Enrollment and opens a new one). Regenerates fee instalments for the destination class if it has a Fee Structure. */
export async function transferStudentSection(studentId: string, newClassId: string): Promise<{ error?: string }> {
  await requireModuleAccess("Students", "EDIT");
  const sdb = await getScopedDb();

  const [student, newClass] = await Promise.all([
    sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { classId: true } }),
    sdb.class.findUniqueOrThrow({ where: { id: newClassId }, select: { id: true, yearId: true } }),
  ]);
  if (student.classId === newClassId) return { error: "Student is already in this class." };

  await sdb.$transaction(async (tx) => {
    await promoteStudent(studentId, newClassId, "PROMOTED", tx);
    await tx.student.update({ where: { id: studentId }, data: { classId: newClassId } });
  });
  await generateInstalmentsForStudent(sdb, studentId, newClassId, newClass.yearId);

  revalidatePath(`/app/students/${studentId}`);
  revalidatePath("/app/students");
  revalidatePath("/app/fees");
  return {};
}

/** Soft delete — sets status INACTIVE rather than removing the row, so attendance/marks/fee history stay intact. Warns (doesn't block) when the student has fee payment history, since that history is retained either way. */
export async function deleteStudent(studentId: string): Promise<{ warning?: string }> {
  await requireModuleAccess("Students", "EDIT");
  const sdb = await getScopedDb();

  const paymentCount = await sdb.feePayment.count({ where: { studentId } });
  await sdb.student.update({ where: { id: studentId }, data: { status: "INACTIVE" } });

  revalidatePath("/app/students");
  revalidatePath(`/app/students/${studentId}`);
  return paymentCount > 0 ? { warning: `This student has ${paymentCount} recorded fee payment${paymentCount === 1 ? "" : "s"} — that history is kept.` } : {};
}
