import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import NewEnquiryForm from "./NewEnquiryForm";

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
        <NewEnquiryForm grades={grades} />
      </div>
    </div>
  );
}
