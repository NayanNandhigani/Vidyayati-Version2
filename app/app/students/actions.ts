"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, Gender } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { enrollStudent, promoteStudent } from "@/lib/domain/enrollment";
import { generateInstalmentsForStudent } from "@/lib/fee-instalments";
import { validateDob } from "@/lib/validation";
import type { StudentStatus } from "@prisma/client";

export type StudentFormState = { error?: string };

export async function createStudent(_prevState: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const firstName = formData.get("firstName");
  const surname = formData.get("surname");
  const admissionNo = formData.get("admissionNo");
  const classId = formData.get("classId");
  const dob = formData.get("dob");
  const gender = formData.get("gender");

  if (
    typeof firstName !== "string" || !firstName.trim() ||
    typeof surname !== "string" || !surname.trim() ||
    typeof admissionNo !== "string" || !admissionNo.trim() ||
    typeof classId !== "string" || !classId
  ) {
    return { error: "First name, surname, admission number, and class are required." };
  }
  const dobError = typeof dob === "string" ? validateDob(dob) : null;
  if (dobError) return { error: dobError };

  await requireModuleAccess("Students", "EDIT", classId);
  const sdb = await getScopedDb();
  await sdb.class.findUniqueOrThrow({ where: { id: classId }, select: { id: true } });

  const session = await auth();
  const school = await db.school.findUnique({ where: { id: session!.user.schoolId! }, select: { maxStudents: true } });
  if (school?.maxStudents != null) {
    const activeCount = await sdb.student.count({ where: { status: "ACTIVE" } });
    if (activeCount >= school.maxStudents) {
      return { error: `This school's student limit (${school.maxStudents}) has been reached. Contact Vidya Yati to raise it.` };
    }
  }

  let student;
  try {
    student = await sdb.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: scopedCreateData<Prisma.StudentUncheckedCreateInput>({
          firstName: firstName.trim(),
          surname: surname.trim(),
          admissionNo: admissionNo.trim(),
          classId,
          dob: typeof dob === "string" && dob ? new Date(dob) : null,
          gender: typeof gender === "string" && gender ? (gender as Gender) : null,
        }),
      });
      await enrollStudent(student.id, classId, undefined, tx);
      return student;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Admission numbers are unique per school, not per class (see the
      // Student model's own comment) — name the actual clash rather than
      // implying it's scoped to the class being added to.
      const clash = await sdb.student.findFirst({ where: { admissionNo: admissionNo.trim() }, include: { class: true } });
      return {
        error: clash
          ? `Admission number "${admissionNo.trim()}" is already used by ${clash.firstName} ${clash.surname} in Class ${clash.class.grade}-${clash.class.section}.`
          : "This admission number is already in use.",
      };
    }
    throw e;
  }

  revalidatePath("/app/students");
  redirect(`/app/students/${student.id}`);
}

// The client already asks the admin to confirm before calling this — see
// the confirm() gate in StudentFeeAllocationPanel — since it changes this
// student's recorded scholarship (the class's actual fee, from Academic
// Management → Fee Structure, minus this charged fee).
export async function updateStudentChargedFee(studentId: string, chargedFee: number | null) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") throw new Error("Only a School Admin can change a student's charged fee.");
  const sdb = await getScopedDb();

  if (chargedFee != null && (!Number.isFinite(chargedFee) || chargedFee < 0 || !Number.isInteger(chargedFee))) {
    throw new Error("Charged fee must be a whole number ≥ 0.");
  }

  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { classId: true } });
  const cls = await sdb.class.findUniqueOrThrow({ where: { id: student.classId }, select: { grade: true, yearId: true } });
  const feeDefault = await sdb.classFeeDefault.findUnique({ where: { yearId_grade: { yearId: cls.yearId, grade: cls.grade } } });
  if (chargedFee != null && feeDefault && chargedFee > Number(feeDefault.actualFee)) {
    throw new Error("Charged fee can't be more than the actual fee.");
  }

  await sdb.student.update({ where: { id: studentId }, data: { chargedFee } });
  await generateInstalmentsForStudent(sdb, studentId, student.classId, cls.yearId);
  revalidatePath(`/app/students/${studentId}`);
  revalidatePath("/app/fees");
}

export type StudentProfileFields = {
  firstName: string;
  surname: string;
  dob: string | null;
  gender: Gender | null;
  address: string | null;
  bloodGroup: string | null;
  medicalNotes: string | null;
  rollNumber: string | null;
};

/** Edits the core profile fields the QA pass found had no edit path at all — everything but class/status/guardians, which are their own dedicated actions below. */
export async function updateStudentProfile(studentId: string, fields: StudentProfileFields): Promise<{ error?: string }> {
  await requireModuleAccess("Students", "EDIT");
  if (!fields.firstName.trim() || !fields.surname.trim()) return { error: "First name and surname are required." };
  const dobError = fields.dob ? validateDob(fields.dob) : null;
  if (dobError) return { error: dobError };
  const sdb = await getScopedDb();

  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId }, select: { classId: true } });
  const cls = await sdb.class.findUniqueOrThrow({ where: { id: student.classId }, select: { yearId: true } });

  await sdb.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        firstName: fields.firstName.trim(),
        surname: fields.surname.trim(),
        dob: fields.dob ? new Date(fields.dob) : null,
        gender: fields.gender,
        address: fields.address?.trim() || null,
        bloodGroup: fields.bloodGroup?.trim() || null,
        medicalNotes: fields.medicalNotes?.trim() || null,
      },
    });
    const enrollment = await tx.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: cls.yearId } } });
    if (enrollment) await tx.enrollment.update({ where: { id: enrollment.id }, data: { rollNumber: fields.rollNumber?.trim() || null } });
  });

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
