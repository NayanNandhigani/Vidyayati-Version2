import type { ScopedDb } from "@/lib/tenant-db";

export type AuditLabel = { label: string; href: string | null };

/**
 * QA fix 7: audit rows only ever showed a raw id like
 * "cmufbolhx000njv04zic5wbj4" — this resolves a batch of rows (grouped by
 * entityType, one query per type rather than one per row) into a human
 * label ("Exam: QA Unit Test 1 (5-A)", "Student: Alexander Hawkins,
 * AD-2072") and, where the record still exists, a link to it. A deleted
 * row has no record left to look up — its label comes from the snapshot
 * already stored in the DELETE action's `changes.deleted`, handled by the
 * caller before this runs (see AuditLogTable's use of deletedSnapshotLabel).
 * Only the models this QA pass's own examples and highest-traffic types
 * cover are resolved; anything else falls back to "<Type> <shortId>" with
 * no link, rather than guessing at a shape that isn't there.
 */
export async function resolveAuditLabels(sdb: ScopedDb, rows: { entityType: string; entityId: string }[]): Promise<Map<string, AuditLabel>> {
  const idsByType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, new Set());
    idsByType.get(r.entityType)!.add(r.entityId);
  }

  const result = new Map<string, AuditLabel>();
  const key = (t: string, id: string) => `${t}:${id}`;

  await Promise.all(
    Array.from(idsByType.entries()).map(async ([type, idSet]) => {
      const ids = Array.from(idSet);
      switch (type) {
        case "Student": {
          const rows = await sdb.student.findMany({ where: { id: { in: ids } }, include: { class: true } });
          for (const s of rows) result.set(key(type, s.id), { label: `Student: ${s.firstName} ${s.surname}, ${s.admissionNo}`, href: `/app/students/${s.id}` });
          break;
        }
        case "Exam": {
          const rows = await sdb.exam.findMany({ where: { id: { in: ids } }, include: { class: true } });
          for (const e of rows) result.set(key(type, e.id), { label: `Exam: ${e.name} (${e.class.grade}-${e.class.section})`, href: `/app/exams?exam=${e.id}&classId=${e.classId}` });
          break;
        }
        case "FeePayment": {
          const rows = await sdb.feePayment.findMany({ where: { id: { in: ids } }, include: { student: true } });
          for (const p of rows) result.set(key(type, p.id), { label: `Fee Payment: ${p.student.firstName} ${p.student.surname} — ₹${Number(p.amount).toLocaleString("en-IN")}`, href: `/app/students/${p.studentId}` });
          break;
        }
        case "PayrollRun": {
          const rows = await sdb.payrollRun.findMany({ where: { id: { in: ids } }, include: { staff: { include: { user: true } } } });
          for (const p of rows) result.set(key(type, p.id), { label: `Payroll: ${p.staff.user.name} (${p.month})`, href: `/app/employees/${p.staffId}` });
          break;
        }
        case "AccountsTransaction": {
          const rows = await sdb.accountsTransaction.findMany({ where: { id: { in: ids } } });
          for (const t of rows) result.set(key(type, t.id), { label: `Accounts: ${t.description}`, href: `/app/accounts` });
          break;
        }
        case "AdmissionEnquiry": {
          const rows = await sdb.admissionEnquiry.findMany({ where: { id: { in: ids } } });
          for (const e of rows) result.set(key(type, e.id), { label: `Admission: ${e.applicantName} (${e.classApplied})`, href: `/app/admissions/${e.id}` });
          break;
        }
        case "Parent": {
          const rows = await sdb.parent.findMany({ where: { id: { in: ids } } });
          for (const p of rows) result.set(key(type, p.id), { label: `Parent/Guardian: ${p.name}`, href: null });
          break;
        }
        case "StaffProfile": {
          const rows = await sdb.staffProfile.findMany({ where: { id: { in: ids } }, include: { user: true } });
          for (const s of rows) result.set(key(type, s.id), { label: `Staff: ${s.user.name}`, href: `/app/employees/${s.id}` });
          break;
        }
        default:
          break; // no resolver for this type — caller falls back to the raw id
      }
    })
  );

  return result;
}
