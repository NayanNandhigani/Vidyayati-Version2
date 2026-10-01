"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type Gender } from "@prisma/client";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { cleanPhone, validateOptionalEmail, validateDob } from "@/lib/validation";
import { parseDateOnly } from "@/lib/ist";
import { toActionError } from "@/lib/action-result";
import { runAction, UserError } from "@/lib/action-result";

export type EnquiryFormState = { error?: string; fieldErrors?: Partial<Record<keyof EnquiryCoreFields, string>>; values?: EnquiryCoreFields; attempt?: number };

export type EnquiryCoreFields = {
  applicantName: string;
  dob: string; // yyyy-mm-dd, or ""
  gender: Gender | "";
  parentContact: string;
  email: string;
  parentName: string;
  address: string;
  classApplied: string;
  enquirySource: string;
  followUpDate: string; // yyyy-mm-dd, or ""
  notes: string;
};

/** Checks an enquiry's fields; returns a message per bad field (empty when all fine). `classes` is the school's real class list — the class must be one of them. */
async function validateEnquiryCore(f: EnquiryCoreFields, sdb: Awaited<ReturnType<typeof getScopedDb>>): Promise<Partial<Record<keyof EnquiryCoreFields, string>>> {
  const errors: Partial<Record<keyof EnquiryCoreFields, string>> = {};
  if (!f.applicantName.trim()) errors.applicantName = "Enter the applicant's name.";
  else if (f.applicantName.trim().length > 120) errors.applicantName = "Name is too long (120 characters at most).";
  if (!f.classApplied.trim()) errors.classApplied = "Pick the class this applicant is applying for.";
  else if ((await sdb.class.count({ where: { grade: f.classApplied.trim() } })) === 0) errors.classApplied = "Pick one of the school's classes from the list.";
  const phone = cleanPhone(f.parentContact, "Contact number", { required: true });
  if (phone.error) errors.parentContact = phone.error;
  const emailErr = validateOptionalEmail(f.email);
  if (emailErr) errors.email = emailErr;
  const dobErr = validateDob(f.dob, 2, 20);
  if (dobErr) errors.dob = dobErr;
  if (f.followUpDate && !parseDateOnly(f.followUpDate)) errors.followUpDate = "Follow-up date isn't a valid date.";
  return errors;
}

function enquiryCoreData(f: EnquiryCoreFields) {
  return {
    applicantName: f.applicantName.trim(),
    dob: parseDateOnly(f.dob),
    gender: f.gender || null,
    parentContact: cleanPhone(f.parentContact).value ?? f.parentContact.trim(),
    email: f.email.trim() || null,
    parentName: f.parentName.trim() || null,
    address: f.address.trim() || null,
    classApplied: f.classApplied.trim(),
    enquirySource: f.enquirySource.trim() || null,
    followUpDate: parseDateOnly(f.followUpDate),
    notes: f.notes.trim() || null,
  };
}

function firstError(errors: Partial<Record<string, string>>): string | null {
  return Object.values(errors).find(Boolean) ?? null;
}

export async function createEnquiry(_prevState: EnquiryFormState, formData: FormData): Promise<EnquiryFormState> {
  await requireModuleAccess("Admissions", "EDIT");
  const sdb = await getScopedDb();

  const fields: EnquiryCoreFields = {
    applicantName: String(formData.get("applicantName") ?? ""),
    dob: String(formData.get("dob") ?? ""),
    gender: (String(formData.get("gender") ?? "") || "") as Gender | "",
    parentContact: String(formData.get("parentContact") ?? ""),
    email: String(formData.get("email") ?? ""),
    parentName: String(formData.get("parentName") ?? ""),
    address: String(formData.get("address") ?? ""),
    classApplied: String(formData.get("classApplied") ?? ""),
    enquirySource: String(formData.get("enquirySource") ?? ""),
    followUpDate: String(formData.get("followUpDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const fieldErrors = await validateEnquiryCore(fields, sdb);
  if (Object.keys(fieldErrors).length > 0) return { error: "Please fix the highlighted fields.", fieldErrors, values: fields, attempt: Date.now() };

  try {
    await sdb.admissionEnquiry.create({
      data: scopedCreateData<Prisma.AdmissionEnquiryUncheckedCreateInput>(enquiryCoreData(fields)),
    });
  } catch (err) {
    return { ...toActionError(err, "createEnquiry"), values: fields, attempt: Date.now() };
  }

  revalidatePath("/app/admissions");
  redirect(`/app/admissions?saved=${encodeURIComponent(fields.applicantName.trim())}`);
}

/** Edits an enquiry's own fields (the detail drawer's "Edit") — distinct from updateApplicationDetails, which edits the fuller Application-stage form. */
export async function updateEnquiryCore(enquiryId: string, fields: EnquiryCoreFields): Promise<{ error?: string }> {
  await requireModuleAccess("Admissions", "EDIT");
  const sdb = await getScopedDb();
  const error = firstError(await validateEnquiryCore(fields, sdb));
  if (error) return { error };

  await sdb.admissionEnquiry.update({ where: { id: enquiryId }, data: enquiryCoreData(fields) });
  revalidatePath("/app/admissions");
  revalidatePath(`/app/admissions/${enquiryId}`);
  return {};
}

export async function advanceToApplication(enquiryId: string) {
  await requireModuleAccess("Admissions", "EDIT");
  const sdb = await getScopedDb();
  await sdb.admissionEnquiry.update({ where: { id: enquiryId }, data: { stage: "APPLICATION" } });
  revalidatePath("/app/admissions");
}

/** Deletes an enquiry that never became a student. Blocked once admitted — that would orphan the real Student/Parent records already created from it; use Reject instead to remove it from the active pipeline. */
export async function deleteEnquiry(enquiryId: string) {
  return runAction(async () => {
    await requireModuleAccess("Admissions", "EDIT");
    const sdb = await getScopedDb();
    const enquiry = await sdb.admissionEnquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { stage: true } });
    if (enquiry.stage === "ADMITTED") throw new UserError("This enquiry has already been admitted and can't be deleted.");
    await sdb.admissionEnquiry.delete({ where: { id: enquiryId } });
    revalidatePath("/app/admissions");
  }, "deleteEnquiry");
}
