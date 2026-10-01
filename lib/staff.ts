import type { StaffCategory } from "@prisma/client";
import type { ScopedDb } from "./tenant-db";

// One definition of "who counts as staff" and how they're classified, used
// by the Dashboard and the Employees page alike (QA BUG-16: they showed
// 2/0 and 1/1 for the same school). Classification is by the employee's
// staff type (staffCategory: Teaching / Non-teaching) — never the free-text
// department.

/** Staff who count: everyone not deleted (on-leave staff are still staff). */
export const ACTIVE_STAFF_WHERE = { deletedAt: null } as const;

export type StaffCounts = { total: number; teaching: number; nonTeaching: number; onLeave: number };

export function classifyStaff(staff: { staffCategory: StaffCategory; employmentStatus?: string | null }[]): StaffCounts {
  const teaching = staff.filter((s) => s.staffCategory === "TEACHING").length;
  return { total: staff.length, teaching, nonTeaching: staff.length - teaching, onLeave: staff.filter((s) => s.employmentStatus === "ON_LEAVE").length };
}

export async function getStaffCounts(sdb: ScopedDb): Promise<StaffCounts> {
  const staff = await sdb.staffProfile.findMany({ where: ACTIVE_STAFF_WHERE, select: { staffCategory: true, employmentStatus: true } });
  return classifyStaff(staff);
}

/** The controlled list of departments. */
export const DEPARTMENTS = ["Academics", "Administration", "Accounts", "Transport", "Hostel", "Library", "Sports", "IT", "Maintenance", "Support Staff"] as const;

const ALIASES: Record<string, (typeof DEPARTMENTS)[number]> = {
  academic: "Academics",
  academics: "Academics",
  teaching: "Academics",
  admin: "Administration",
  administration: "Administration",
  office: "Administration",
  account: "Accounts",
  accounts: "Accounts",
  finance: "Accounts",
  transport: "Transport",
  hostel: "Hostel",
  library: "Library",
  sports: "Sports",
  "physical education": "Sports",
  it: "IT",
  maintenance: "Maintenance",
  "support staff": "Support Staff",
  support: "Support Staff",
};

/** Maps a typed or legacy department to the controlled list ("Academic" → "Academics"); null when it doesn't match one. */
export function normalizeDepartment(value: string | null | undefined): (typeof DEPARTMENTS)[number] | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return ALIASES[key] ?? (DEPARTMENTS as readonly string[]).find((d) => d.toLowerCase() === key) as (typeof DEPARTMENTS)[number] | null ?? null;
}
