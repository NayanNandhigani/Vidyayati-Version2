/**
 * Removes the test data the QA pass left in the "Nayan international"
 * school. Dry run by default — it prints exactly what it would delete and
 * changes nothing. Add --apply to delete.
 *
 *   npm run qa-cleanup            # show what would be removed
 *   npm run qa-cleanup -- --apply # remove it
 *
 * Removes:
 *   - student "QA FutureDOB" (admission no. QA-9901, class 6-B) and their
 *     own records (marks, attendance, fee lines — refuses if any fee has
 *     been paid, so no payment history is lost)
 *   - class 5-A attendance dated 02 Dec 2026 (a future date the QA pass
 *     could enter before BUG-05 was fixed)
 *   - the "Lead Image" certificate template (QA BUG-26), only if no
 *     certificate was ever issued from it
 * Keeps (reported, not touched): the 29 Sep 2026 attendance and Ashton
 * Crawford's marks, which serve as sample data.
 *
 * Deletes go through the tenant client, so the student and attendance
 * deletions appear in the school's Audit Log. Running it twice is safe.
 */
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/tenant-db";

const APPLY = process.argv.includes("--apply");
const SCHOOL_NAME = "Nayan international";
const FUTURE_ATTENDANCE_DATE = new Date("2026-12-02T00:00:00.000Z"); // date-only column
const KEPT_ATTENDANCE_DATE = new Date("2026-09-29T00:00:00.000Z");

async function main() {
  const schools = await db.school.findMany({ where: { name: { equals: SCHOOL_NAME, mode: "insensitive" } }, select: { id: true, name: true } });
  if (schools.length !== 1) throw new Error(`Expected exactly one school named "${SCHOOL_NAME}", found ${schools.length}. Nothing changed.`);
  const school = schools[0]!;
  const sdb = scopedDb(school.id);
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${school.name} (${school.id})\n`);

  // 1. Student QA FutureDOB
  const students = await sdb.student.findMany({
    where: { admissionNo: "QA-9901", firstName: { equals: "QA", mode: "insensitive" }, surname: { equals: "FutureDOB", mode: "insensitive" } },
    include: { class: true, _count: { select: { marks: true, attendance: true, feeInstalments: true, feePayments: true } } },
  });
  for (const s of students) {
    const cls = s.class ? `${s.class.grade}-${s.class.section}` : "no class";
    console.log(`Student ${s.firstName} ${s.surname} (${s.admissionNo}, class ${cls}): ${s._count.marks} marks, ${s._count.attendance} attendance, ${s._count.feeInstalments} fee lines, ${s._count.feePayments} payments`);
    if (s._count.feePayments > 0) {
      console.log("  ✗ Skipped: has fee payments. Reverse them in Fees first if they were test payments.");
      continue;
    }
    if (APPLY) {
      await sdb.student.delete({ where: { id: s.id } });
      console.log("  ✓ Deleted");
    }
  }
  if (students.length === 0) console.log("Student QA-9901 (QA FutureDOB): not found — already removed.");

  // 2. Class 5-A attendance on 02 Dec 2026
  const class5A = await sdb.class.findMany({ where: { grade: "5", section: "A" }, select: { id: true } });
  const futureRows = await sdb.attendance.findMany({
    where: { date: FUTURE_ATTENDANCE_DATE, OR: [{ classId: { in: class5A.map((c) => c.id) } }, { classId: null, student: { classId: { in: class5A.map((c) => c.id) } } }] },
    select: { id: true },
  });
  console.log(`\nClass 5-A attendance on 02 Dec 2026: ${futureRows.length} row(s)`);
  if (APPLY) {
    for (const r of futureRows) await sdb.attendance.delete({ where: { id: r.id } });
    if (futureRows.length) console.log("  ✓ Deleted");
  }

  // 3. "Lead Image" certificate template
  const templates = await sdb.certificateTemplate.findMany({ where: { label: { equals: "Lead Image", mode: "insensitive" } }, include: { _count: { select: { issued: true } } } });
  console.log(`\n"Lead Image" certificate template: ${templates.length ? templates.map((t) => `${t._count.issued} issued`).join(", ") : "not found"}`);
  for (const t of templates) {
    if (t._count.issued > 0) {
      console.log("  ✗ Skipped: certificates were issued from it. Rename it in Settings → Document Editor instead.");
      continue;
    }
    if (APPLY) {
      await sdb.certificateTemplate.delete({ where: { id: t.id } });
      console.log("  ✓ Deleted");
    }
  }

  // Kept as sample data
  const kept = await sdb.attendance.count({ where: { date: KEPT_ATTENDANCE_DATE } });
  const ashton = await sdb.mark.count({ where: { student: { firstName: { equals: "Ashton", mode: "insensitive" }, surname: { equals: "Crawford", mode: "insensitive" } } } });
  console.log(`\nKept: ${kept} attendance row(s) for 29 Sep 2026, ${ashton} mark(s) for Ashton Crawford.`);
  if (!APPLY) console.log("\nNothing was changed. Run again with --apply to delete the items above.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
