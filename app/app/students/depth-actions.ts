"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { requireFeature, hasFeature } from "@/lib/feature-flags";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { findOrLinkGuardian } from "@/lib/guardian";
import { validatePhone, validateOptionalEmail } from "@/lib/validation";
import { nextAdmissionNumber } from "@/lib/admission-number";
import type { ParentRelation } from "@prisma/client";

async function schoolId() {
  const session = await auth();
  return session!.user.schoolId!;
}

export async function updateStudentMedicalInfo(
  studentId: string,
  data: { address?: string; bloodGroup?: string; medicalNotes?: string }
) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);
  await requireFeature(await schoolId(), "students.medicalInfo");

  await sdb.student.update({ where: { id: studentId }, data });
  revalidatePath(`/app/students/${studentId}`);
}

export async function addEmergencyContact(studentId: string, data: { name: string; relation: string; phone: string; priority: number }) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);
  await requireFeature(await schoolId(), "students.medicalInfo");

  await sdb.studentEmergencyContact.create({ data: { ...data, studentId, schoolId: await schoolId() } });
  revalidatePath(`/app/students/${studentId}`);
}

export async function deleteEmergencyContact(studentId: string, contactId: string) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);

  await sdb.studentEmergencyContact.delete({ where: { id: contactId } });
  revalidatePath(`/app/students/${studentId}`);
}

export async function updateStudentPriorSchool(
  studentId: string,
  data: { previousSchoolName?: string; previousTcNo?: string; previousTcDate?: string; priorPerformanceNote?: string }
) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);
  await requireFeature(await schoolId(), "students.priorSchool");

  await sdb.student.update({
    where: { id: studentId },
    data: { ...data, previousTcDate: data.previousTcDate ? new Date(data.previousTcDate) : null },
  });
  revalidatePath(`/app/students/${studentId}`);
}

export async function setPrimaryGuardian(studentId: string, linkId: string) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);

  await sdb.studentParentLink.updateMany({ where: { studentId }, data: { isPrimary: false } });
  await sdb.studentParentLink.update({ where: { id: linkId }, data: { isPrimary: true } });
  revalidatePath(`/app/students/${studentId}`);
}

export async function updateGuardianContactPreference(parentId: string, preferredContactMethod: string) {
  const sdb = await getScopedDb();
  await requireModuleAccess("Students", "EDIT");
  await sdb.parent.update({ where: { id: parentId }, data: { preferredContactMethod: preferredContactMethod || null } });
  revalidatePath(`/app/students`);
}

/** Adds a guardian to a student — reuses an existing Parent by phone (e.g. a sibling's guardian) or creates a new one + login, same as the admissions admit flow. Returns a one-time setup link when a new login was created. */
export async function addGuardianToStudent(
  studentId: string,
  fields: { name: string; relation: ParentRelation; phone: string; email: string }
): Promise<{ error?: string; setupToken?: string }> {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);

  if (!fields.name.trim()) return { error: "Guardian name is required." };
  const phoneErr = validatePhone(fields.phone, "Phone number");
  if (phoneErr) return { error: phoneErr };
  const emailErr = validateOptionalEmail(fields.email);
  if (emailErr) return { error: emailErr };

  const result = await findOrLinkGuardian(sdb, studentId, { name: fields.name, phone: fields.phone, email: fields.email || null, relation: fields.relation });
  revalidatePath(`/app/students/${studentId}`);
  return { setupToken: result?.setupToken };
}

/** Unlinks a guardian from this student — doesn't delete the Parent/User account itself (they may be linked to other students, or the school may want to keep the account for re-linking later). */
export async function unlinkGuardian(studentId: string, linkId: string) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);

  await sdb.studentParentLink.delete({ where: { id: linkId } });
  revalidatePath(`/app/students/${studentId}`);
}

export async function addStudentDocument(studentId: string, category: string, formData: FormData) {
  const sdb = await getScopedDb();
  const student = await sdb.student.findUniqueOrThrow({ where: { id: studentId } });
  await requireModuleAccess("Students", "EDIT", student.classId);
  await requireFeature(await schoolId(), "students.documents");

  const file = formData.get("file");
  const expiryDate = formData.get("expiryDate");
  if (!(file instanceof File) || file.size === 0) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { storagePath } = await saveUploadedFile(`documents/${await schoolId()}`, file.name, bytes);

  await sdb.personDocument.create({
    data: {
      schoolId: await schoolId(),
      subjectType: "STUDENT",
      studentId,
      category,
      label: file.name,
      filePath: storagePath,
      expiryDate: typeof expiryDate === "string" && expiryDate ? new Date(expiryDate) : null,
    },
  });
  revalidatePath(`/app/students/${studentId}`);
}

export async function deletePersonDocument(redirectPath: string, documentId: string) {
  const sdb = await getScopedDb();
  await requireModuleAccess("Students", "EDIT");

  const doc = await sdb.personDocument.findUnique({ where: { id: documentId } });
  if (doc) await deleteUploadedFile(doc.filePath);
  await sdb.personDocument.delete({ where: { id: documentId } });
  revalidatePath(redirectPath);
}

/** A pure suggestion for the New Student form — never blocks or changes the existing free-text admissionNo field/validation. */
export async function suggestAdmissionNo(): Promise<string> {
  const sdb = await getScopedDb();
  return nextAdmissionNumber(sdb, await schoolId());
}

export async function updateAdmissionNoPrefix(prefix: string) {
  const sdb = await getScopedDb();
  await requireModuleAccess("Students", "EDIT");
  await sdb.school.update({ where: { id: await schoolId() }, data: { admissionNoPrefix: prefix.trim() || null } });
  revalidatePath("/app/students/new");
}

/** Siblings = other active students sharing at least one guardian, via the existing StudentParentLink table — no new relationship model needed. */
export async function getSiblings(studentId: string) {
  const sdb = await getScopedDb();
  const enabled = await hasFeature(await schoolId(), "students.siblings");
  if (!enabled) return [];

  const links = await sdb.studentParentLink.findMany({ where: { studentId }, select: { parentId: true } });
  const parentIds = links.map((l) => l.parentId);
  if (parentIds.length === 0) return [];

  const siblingLinks = await sdb.studentParentLink.findMany({
    where: { parentId: { in: parentIds }, studentId: { not: studentId } },
    include: { student: { include: { class: true } } },
    distinct: ["studentId"],
  });

  return siblingLinks.map((l) => ({
    id: l.student.id,
    name: `${l.student.firstName} ${l.student.surname}`,
    className: `${l.student.class.grade}-${l.student.class.section}`,
    admissionNo: l.student.admissionNo,
  }));
}
