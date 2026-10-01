"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformModuleAccess } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-flags";
import { runAction, UserError } from "@/lib/action-result";

export async function createSchoolGroup(name: string) {
  return runAction(async () => {
    await requirePlatformModuleAccess("Schools", "EDIT");
    if (!name.trim()) throw new UserError("Group name is required.");
    const group = await db.schoolGroup.create({ data: { name: name.trim() } });
    revalidatePath("/super-admin/schools");
    revalidatePath("/super-admin/reports");
    return group;
  }, "createSchoolGroup");
}

/** A school must have the "admin.schoolGroups" feature granted before Super Admin can tag it into a group. */
export async function assignSchoolGroup(schoolId: string, groupId: string | null) {
  await requirePlatformModuleAccess("Schools", "EDIT");
  await requireFeature(schoolId, "admin.schoolGroups");
  await db.school.update({ where: { id: schoolId }, data: { groupId } });
  revalidatePath(`/super-admin/schools/${schoolId}`);
  revalidatePath("/super-admin/reports");
}
