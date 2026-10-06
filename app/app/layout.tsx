import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { scopedDb, scopedCreateData } from "@/lib/tenant-db";
import { moduleLabelForPath } from "@/components/sidebar-config";
import AppShell from "@/components/AppShell";
import { logoUrl, roleLabel, schoolInitials, schoolSubtitle } from "@/lib/school-branding";
import { signOutAction } from "./actions";
import { hasFeature } from "@/lib/feature-flags";
import { getStaffPermissionRows } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !session.user.schoolId) {
    redirect("/signin");
  }

  // Independent reads run together rather than one after another (QA BUG-28).
  const [school, inventoryEnabled, staffPermissions] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: session.user.schoolId }, select: { name: true, disabledModules: true, logoPath: true, city: true, state: true, affiliationBoard: true } }),
    hasFeature(session.user.schoolId, "inventory.module"),
    session.user.role === "STAFF" ? getStaffPermissionRows(session.user.id) : Promise.resolve(null),
  ]);
  const disabledSchoolModules = new Set(school.disabledModules);
  // Inventory is a whole new module (Batch 14), not an existing one — gate
  // its sidebar entry behind the Super Admin feature flag entirely, same
  // hidden-until-granted default as every other "depth" feature, rather
  // than adding a second nav-visibility mechanism.
  if (!inventoryEnabled) {
    disabledSchoolModules.add("Inventory");
  }

  const pathname = (await headers()).get("x-pathname");
  const moduleLabel = pathname ? moduleLabelForPath(pathname) : null;
  if (moduleLabel) {
    const sdb = scopedDb(session.user.schoolId, session.user.id);
    sdb.activityLog
      .create({ data: scopedCreateData<Prisma.ActivityLogUncheckedCreateInput>({ userId: session.user.id, type: "PAGE_VIEW", module: moduleLabel }) })
      .catch(() => {});
  }

  const visibleModules = staffPermissions ? new Set(staffPermissions.filter((p) => p.accessLevel !== "NONE").map((p) => p.moduleName)) : null;

  const role = session.user.role as "SCHOOL_ADMIN" | "STAFF" | "PARENT";
  return (
    <AppShell
      role={role}
      roleLabel={roleLabel(role)}
      visibleModules={visibleModules}
      disabledSchoolModules={disabledSchoolModules}
      school={{ name: school.name, subtitle: schoolSubtitle(school), logoUrl: logoUrl(school.logoPath), initials: schoolInitials(school.name) }}
      userName={session.user.name ?? "User"}
      onSignOut={signOutAction}
    >
      {children}
    </AppShell>
  );
}
