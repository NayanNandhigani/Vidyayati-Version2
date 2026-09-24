import Link from "next/link";
import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import AdmissionsBoard from "./AdmissionsBoard";

export default async function AdmissionsPage() {
  const accessLevel = await requireModuleAccess("Admissions", "VIEW");
  const canEdit = accessLevel === "EDIT";
  const session = await auth();
  const sdb = await getScopedDb();

  const [enquiries, classes] = await Promise.all([
    sdb.admissionEnquiry.findMany({ orderBy: { createdAt: "desc" } }),
    sdb.class.findMany({ orderBy: [{ grade: "asc" }, { section: "asc" }] }),
  ]);

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 16, height: "100dvh", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="disp" style={{ fontSize: 21 }}>
          Admissions pipeline
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/app/admissions/blank-form/print"
            target="_blank"
            style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            View Admission Form
          </Link>
          {canEdit && (
            <Link href="/app/admissions/new" style={{ background: "var(--marigold)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              + New Enquiry
            </Link>
          )}
        </div>
      </div>

      <AdmissionsBoard
        enquiries={enquiries.map((e) => ({
          id: e.id,
          applicantName: e.applicantName,
          dob: e.dob?.toISOString().slice(0, 10) ?? null,
          gender: e.gender,
          parentContact: e.parentContact,
          email: e.email,
          classApplied: e.classApplied,
          stage: e.stage,
          approvalStatus: e.approvalStatus,
          convertedStudentId: e.convertedStudentId,
          rejectionReason: e.rejectionReason,
          parentName: e.parentName,
          address: e.address,
          enquirySource: e.enquirySource,
          followUpDate: e.followUpDate?.toISOString().slice(0, 10) ?? null,
          notes: e.notes,
          createdAt: e.createdAt.toISOString(),
        }))}
        classes={classes.map((c) => ({ id: c.id, grade: c.grade, section: c.section }))}
        canEdit={canEdit}
        isAdmin={session!.user.role === "SCHOOL_ADMIN"}
      />
    </div>
  );
}
