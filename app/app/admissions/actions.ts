"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type Gender } from "@prisma/client";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { validatePhone, validateOptionalEmail } from "@/lib/validation";

export type EnquiryFormState = { error?: string };

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

function validateEnquiryCore(f: EnquiryCoreFields): string | null {
  if (!f.applicantName.trim()) return "Applicant name is required.";
  if (!f.classApplied.trim()) return "Pick the class this applicant is applying for.";
  const phoneErr = validatePhone(f.parentContact, "Contact number");
  if (phoneErr) return phoneErr;
  const emailErr = validateOptionalEmail(f.email);
  if (emailErr) return emailErr;
  if (f.dob && Number.isNaN(Date.parse(f.dob))) return "Date of birth isn't valid.";
  if (f.dob && new Date(f.dob) > new Date()) return "Date of birth can't be in the future.";
  if (f.followUpDate && Number.isNaN(Date.parse(f.followUpDate))) return "Follow-up date isn't valid.";
  return null;
}

function enquiryCoreData(f: EnquiryCoreFields) {
  return {
    applicantName: f.applicantName.trim(),
    dob: f.dob ? new Date(f.dob) : null,
    gender: f.gender || null,
    parentContact: f.parentContact.trim(),
    email: f.email.trim() || null,
    parentName: f.parentName.trim() || null,
    address: f.address.trim() || null,
    classApplied: f.classApplied.trim(),
    enquirySource: f.enquirySource.trim() || null,
    followUpDate: f.followUpDate ? new Date(f.followUpDate) : null,
    notes: f.notes.trim() || null,
  };
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

  const error = validateEnquiryCore(fields);
  if (error) return { error };

  await sdb.admissionEnquiry.create({
    data: scopedCreateData<Prisma.AdmissionEnquiryUncheckedCreateInput>(enquiryCoreData(fields)),
  });

  revalidatePath("/app/admissions");
  redirect("/app/admissions");
}

/** Edits an enquiry's own fields (the detail drawer's "Edit") — distinct from updateApplicationDetails, which edits the fuller Application-stage form. */
export async function updateEnquiryCore(enquiryId: string, fields: EnquiryCoreFields): Promise<{ error?: string }> {
  await requireModuleAccess("Admissions", "EDIT");
  const error = validateEnquiryCore(fields);
  if (error) return { error };

  const sdb = await getScopedDb();
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
  await requireModuleAccess("Admissions", "EDIT");
  const sdb = await getScopedDb();
  const enquiry = await sdb.admissionEnquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { stage: true } });
  if (enquiry.stage === "ADMITTED") throw new Error("This enquiry has already been admitted and can't be deleted.");
  await sdb.admissionEnquiry.delete({ where: { id: enquiryId } });
  revalidatePath("/app/admissions");
}
