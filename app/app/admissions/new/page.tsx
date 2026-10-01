import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import NewEnquiryForm from "./NewEnquiryForm";
import { todayIST } from "@/lib/ist";

export default async function NewEnquiryPage() {
  await requireModuleAccess("Admissions", "EDIT");
  const sdb = await getScopedDb();
  const classes = await sdb.class.findMany({ orderBy: [{ grade: "asc" }, { section: "asc" }] });
  const grades = Array.from(new Set(classes.map((c) => c.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <div style={{ padding: "26px 34px" }}>
      <div className="disp" style={{ fontSize: 21, marginBottom: 4 }}>
        New Enquiry
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 0, marginBottom: 22 }}>Log a new admissions enquiry.</p>
      <div className="card" style={{ padding: 24, maxWidth: 480 }}>
        {grades.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
            Add your classes first (Academic Management → Classes &amp; Sections), so an applicant can pick the class they're applying for.
          </p>
        ) : (
          <NewEnquiryForm grades={grades} today={todayIST()} />
        )}
      </div>
    </div>
  );
}
