"use server";

import { normalizeDepartment } from "@/lib/staff";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, Gender } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-flags";
import { createPendingAccount } from "@/lib/account-setup";
import { setSetupTokenFlash } from "@/lib/setup-token-flash";
import { validateOptionalPhone, validateDob, normalizeIndianMobile } from "@/lib/validation";
import type { StaffFormState } from "./actions";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A full teaching/non-teaching application form in one submit — same account-creation flow as createStaff, plus every detailed-profile field. */
export async function createStaffDetailed(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") return { error: "Only a School Admin can add staff." };
  await requireFeature(session!.user.schoolId, "employees.detailedProfile");
  const sdb = await getScopedDb();

  const name = str(formData, "name");
  const username = str(formData, "username");
  if (!name || !username) return { error: "Name and username are required." };

  for (const [key, label] of [["mobileAlternate", "Alternate mobile"], ["emergencyContactPhone", "Emergency contact phone"]] as const) {
    const value = str(formData, key);
    const err = value ? validateOptionalPhone(value, label) : null;
    if (err) return { error: err };
  }
  const mobilePrimaryRaw = str(formData, "mobilePrimary");
  if (mobilePrimaryRaw) {
    const phoneErr = validateOptionalPhone(mobilePrimaryRaw);
    if (phoneErr) return { error: phoneErr };
  }
  const dobRaw = str(formData, "dob");
  const dobErr = dobRaw ? validateDob(dobRaw, 18, 75, "Date of birth") : null;
  if (dobErr) return { error: dobErr };

  const normalizedUsername = username.toLowerCase();
  const existing = await db.user.findUnique({ where: { username: normalizedUsername } });
  if (existing) return { error: "A user with this username already exists." };

  const school = await db.school.findUnique({ where: { id: session!.user.schoolId! }, select: { maxStaff: true } });
  if (school?.maxStaff != null) {
    const staffCount = await sdb.user.count({ where: { role: "STAFF" } });
    if (staffCount >= school.maxStaff) {
      return { error: `This school's staff limit (${school.maxStaff}) has been reached. Contact Vidya Yati to raise it.` };
    }
  }

  const { token, setupTokenHash, setupTokenExpiresAt, placeholderHash } = await createPendingAccount();
  const gender = str(formData, "gender");
  const dob = str(formData, "dob");
  const yearsOfExperience = str(formData, "yearsOfExperience");

  const user = await sdb.user.create({
    data: scopedCreateData<Prisma.UserUncheckedCreateInput>({
      name,
      username: normalizedUsername,
      phone: phoneOrNull(str(formData, "mobilePrimary")),
      role: "STAFF",
      passwordHash: placeholderHash,
      setupTokenHash,
      setupTokenExpiresAt,
    }),
  });

  const staff = await sdb.staffProfile.create({
    data: scopedCreateData<Prisma.StaffProfileUncheckedCreateInput>({
      userId: user.id,
      designation: str(formData, "designation"),
      department: normalizeDepartment(str(formData, "department")) ?? str(formData, "department"),
      staffCategory: str(formData, "staffCategory") === "NON_TEACHING" ? "NON_TEACHING" : "TEACHING",
      dateJoined: new Date(),
      employeeId: str(formData, "employeeId"),
      dob: dob ? new Date(dob) : null,
      gender: gender ? (gender as Gender) : null,
      bloodGroup: str(formData, "bloodGroup"),
      maritalStatus: str(formData, "maritalStatus"),
      nationality: str(formData, "nationality"),
      aadhaarNumber: str(formData, "aadhaarNumber"),
      panNumber: str(formData, "panNumber"),
      mobilePrimary: phoneOrNull(str(formData, "mobilePrimary")),
      mobileAlternate: phoneOrNull(str(formData, "mobileAlternate")),
      personalEmail: str(formData, "personalEmail"),
      currentAddress: str(formData, "currentAddress"),
      permanentAddress: str(formData, "permanentAddress"),
      emergencyContactName: str(formData, "emergencyContactName"),
      emergencyContactPhone: phoneOrNull(str(formData, "emergencyContactPhone")),
      employmentType: str(formData, "employmentType"),
      workLocation: str(formData, "workLocation"),
      reportingManagerId: str(formData, "reportingManagerId"),
      driversLicenseNo: str(formData, "driversLicenseNo"),
      teachingCertification: str(formData, "teachingCertification"),
      yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : null,
      previousEmployerName: str(formData, "previousEmployerName"),
      previousDesignation: str(formData, "previousDesignation"),
      qualifications: str(formData, "qualifications"),
      specialization: str(formData, "specialization"),
      salaryPayGrade: str(formData, "salaryPayGrade"),
      bankAccountNumber: str(formData, "bankAccountNumber"),
      ifscCode: str(formData, "ifscCode"),
      bankName: str(formData, "bankName"),
      pfNumber: str(formData, "pfNumber"),
      uanNumber: str(formData, "uanNumber"),
      esiNumber: str(formData, "esiNumber"),
    }),
  });

  revalidatePath("/app/employees");
  await setSetupTokenFlash(token);
  redirect(`/app/employees/${staff.id}`);
}

export async function suggestEmployeeId(): Promise<string> {
  const session = await auth();
  await requireModuleAccess("Employees", "EDIT");
  const sdb = await getScopedDb();
  const count = await sdb.staffProfile.count();
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}

export type DetailedProfileFields = {
  employeeId: string | null;
  dob: string | null;
  gender: Gender | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  mobilePrimary: string | null;
  mobileAlternate: string | null;
  personalEmail: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  employmentType: string | null;
  workLocation: string | null;
  reportingManagerId: string | null;
  driversLicenseNo: string | null;
  teachingCertification: string | null;
  yearsOfExperience: number | null;
  previousEmployerName: string | null;
  previousDesignation: string | null;
  salaryPayGrade: string | null;
  bankAccountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  pfNumber: string | null;
  uanNumber: string | null;
  esiNumber: string | null;
};

function phoneOrNull(v: string | null | undefined): string | null {
  return v ? normalizeIndianMobile(v) : null;
}

/** Editing the detailed profile after creation, from the staff detail view. */
export async function updateStaffDetailedProfile(staffId: string, fields: DetailedProfileFields): Promise<{ error?: string }> {
  await requireModuleAccess("Employees", "EDIT");
  const session = await auth();
  await requireFeature(session!.user.schoolId, "employees.detailedProfile");

  for (const [value, label] of [[fields.mobilePrimary, "Mobile"], [fields.mobileAlternate, "Alternate mobile"], [fields.emergencyContactPhone, "Emergency contact phone"]] as const) {
    const err = value ? validateOptionalPhone(value, label) : null;
    if (err) return { error: err };
  }
  const dobErr = fields.dob ? validateDob(fields.dob, 18, 75, "Date of birth") : null;
  if (dobErr) return { error: dobErr };

  const sdb = await getScopedDb();
  await sdb.staffProfile.update({
    where: { id: staffId },
    data: {
      ...fields,
      mobilePrimary: phoneOrNull(fields.mobilePrimary),
      mobileAlternate: phoneOrNull(fields.mobileAlternate),
      emergencyContactPhone: phoneOrNull(fields.emergencyContactPhone),
      dob: fields.dob ? new Date(fields.dob) : null,
    },
  });
  revalidatePath(`/app/employees/${staffId}`);
  return {};
}
