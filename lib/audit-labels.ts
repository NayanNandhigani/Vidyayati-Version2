import type { ScopedDb } from "@/lib/tenant-db";
import { formatINR } from "@/lib/format";
import { formatDateIST } from "@/lib/ist";

export type AuditLabel = { label: string; href: string | null };
export type AuditChange = { field: string; before: string; after: string };

// Turns audit rows into something a School Admin can read (QA BUG-24): a
// name for the record ("Mark: Ashton Crawford · Mid-Term · English",
// "Class 5-A") instead of a raw id like cmumgm79y003ljz04eqravcx9, and the
// changed fields as "First name: Priya → Priyanka", with ids inside the
// changes resolved to names. One batched query per record type.

const key = (t: string, id: string) => `${t}:${id}`;
const studentName = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;
const className = (c: { grade: string; section: string }) => `Class ${c.grade}-${c.section}`;
const ATTENDANCE: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day" };

export async function resolveAuditLabels(sdb: ScopedDb, rows: { entityType: string; entityId: string }[]): Promise<Map<string, AuditLabel>> {
  const idsByType = new Map<string, string[]>();
  for (const r of rows) idsByType.set(r.entityType, [...new Set([...(idsByType.get(r.entityType) ?? []), r.entityId])]);

  const result = new Map<string, AuditLabel>();
  const set = (type: string, id: string, label: string, href: string | null = null) => result.set(key(type, id), { label, href });

  await Promise.all(
    Array.from(idsByType.entries()).map(async ([type, ids]) => {
      const where = { where: { id: { in: ids } } };
      switch (type) {
        case "Student":
          for (const s of await sdb.student.findMany({ ...where, include: { class: true } })) set(type, s.id, `Student: ${studentName(s)}, ${s.admissionNo} (${className(s.class)})`, `/app/students/${s.id}`);
          break;
        case "Exam":
          for (const e of await sdb.exam.findMany({ ...where, include: { class: true } })) set(type, e.id, `Exam: ${e.name} (${className(e.class)})`, `/app/exams?exam=${e.id}&classId=${e.classId}`);
          break;
        case "Mark":
          for (const m of await sdb.mark.findMany({ ...where, include: { student: true, examSubject: { include: { exam: true, subject: true } } } }))
            set(type, m.id, `Mark: ${studentName(m.student)} · ${m.examSubject.exam.name} · ${m.examSubject.subject.name}`, `/app/exams?tab=grades&exam=${m.examSubject.examId}&classId=${m.examSubject.exam.classId}`);
          break;
        case "Class":
          for (const c of await sdb.class.findMany(where)) set(type, c.id, className(c), "/app/institute");
          break;
        case "Subject":
          for (const s of await sdb.subject.findMany(where)) set(type, s.id, `Subject: ${s.name}`, "/app/institute?panel=subjects");
          break;
        case "FeeStructure":
          for (const f of await sdb.feeStructure.findMany({ ...where, include: { class: true } })) set(type, f.id, `Fee plan: ${className(f.class)} · ${f.head} · ${f.term}`, "/app/institute?panel=fees");
          break;
        case "FeeInstalment":
          for (const f of await sdb.feeInstalment.findMany({ ...where, include: { student: true, feeStructure: true } })) set(type, f.id, `Fee instalment: ${studentName(f.student)} · ${f.feeStructure.term} (${formatINR(f.amount)})`, `/app/students/${f.studentId}`);
          break;
        case "FeePayment":
          for (const p of await sdb.feePayment.findMany({ ...where, include: { student: true } })) set(type, p.id, `Fee payment: ${studentName(p.student)} — ${formatINR(p.amount)}`, `/app/students/${p.studentId}`);
          break;
        case "FeeDiscount":
          for (const d of await sdb.feeDiscount.findMany({ ...where, include: { student: true } })) set(type, d.id, `Fee discount: ${studentName(d.student)}`, `/app/students/${d.studentId}`);
          break;
        case "FeeAdjustment":
          for (const a of await sdb.feeAdjustment.findMany({ ...where, include: { student: true } })) set(type, a.id, `Extra charge: ${studentName(a.student)} — ${a.description}`, `/app/students/${a.studentId}`);
          break;
        case "PayrollRun":
          for (const p of await sdb.payrollRun.findMany({ ...where, include: { staff: { include: { user: true } } } })) set(type, p.id, `Payroll: ${p.staff.user.name} (${p.month})`, `/app/employees/${p.staffId}`);
          break;
        case "PayrollAdjustment":
          for (const a of await sdb.payrollAdjustment.findMany({ ...where, include: { payrollRun: { include: { staff: { include: { user: true } } } } } }))
            set(type, a.id, `Payroll adjustment: ${a.payrollRun.staff.user.name} (${a.payrollRun.month}) — ${a.reason}`, `/app/employees/${a.payrollRun.staffId}`);
          break;
        case "AccountsTransaction":
          for (const t of await sdb.accountsTransaction.findMany(where)) set(type, t.id, `Accounts: ${t.description}`, "/app/accounts");
          break;
        case "AdmissionEnquiry":
          for (const e of await sdb.admissionEnquiry.findMany(where)) set(type, e.id, `Admission: ${e.applicantName} (Class ${e.classApplied})`, `/app/admissions/${e.id}`);
          break;
        case "Parent":
          for (const p of await sdb.parent.findMany(where)) set(type, p.id, `Parent/guardian: ${p.name}`);
          break;
        case "StaffProfile":
          for (const s of await sdb.staffProfile.findMany({ ...where, include: { user: true } })) set(type, s.id, `Staff: ${s.user.name}`, `/app/employees/${s.id}`);
          break;
        case "StaffPermission":
          for (const p of await sdb.staffPermission.findMany({ ...where, include: { staff: { include: { user: true } }, class: true } }))
            set(type, p.id, `Permission: ${p.staff.user.name} · ${p.moduleName}${p.class ? ` · ${className(p.class)}` : ""}`, `/app/employees/${p.staffId}`);
          break;
        case "Attendance":
          for (const a of await sdb.attendance.findMany({ ...where, include: { student: { include: { class: true } } } }))
            set(type, a.id, `Attendance: ${studentName(a.student)} (${className(a.student.class)}) · ${formatDateIST(a.date)}`, `/app/attendance?classId=${a.student.classId}&date=${a.date.toISOString().slice(0, 10)}`);
          break;
        case "StaffAttendance":
          for (const a of await sdb.staffAttendance.findMany({ ...where, include: { staff: { include: { user: true } } } })) set(type, a.id, `Staff attendance: ${a.staff.user.name} · ${formatDateIST(a.date)}`, `/app/employees/${a.staffId}`);
          break;
        case "HostelAllocation":
          for (const h of await sdb.hostelAllocation.findMany({ ...where, include: { student: true, room: true } })) set(type, h.id, `Hostel: ${studentName(h.student)} · Room ${h.room.roomNo}`, "/app/hostel");
          break;
        case "LibraryBook":
          for (const b of await sdb.libraryBook.findMany(where)) set(type, b.id, `Library book: ${b.title}`, "/app/library");
          break;
        case "LibraryCirculation":
          for (const c of await sdb.libraryCirculation.findMany({ ...where, include: { book: true, student: true } })) set(type, c.id, `Library issue: ${c.book.title}${c.student ? ` → ${studentName(c.student)}` : ""}`, "/app/library");
          break;
        case "Event":
          for (const e of await sdb.event.findMany(where)) set(type, e.id, `Event: ${e.title}`, `/app/events?event=${e.id}`);
          break;
        case "Announcement":
          for (const a of await sdb.announcement.findMany(where)) set(type, a.id, `Announcement: ${a.title}`, "/app/communication");
          break;
        case "TransportVehicle":
          for (const v of await sdb.transportVehicle.findMany(where)) set(type, v.id, `Vehicle: ${v.vehicleNo}`, `/app/transport/vehicles/${v.id}`);
          break;
        case "TransportRoute":
          for (const r of await sdb.transportRoute.findMany(where)) set(type, r.id, `Route: ${r.name}`, "/app/transport");
          break;
        case "StudentTransportAssignment":
          for (const a of await sdb.studentTransportAssignment.findMany({ where: { studentId: { in: ids } }, include: { student: true, route: true } })) set(type, a.studentId, `Bus assignment: ${studentName(a.student)} → ${a.route.name}`, "/app/transport");
          break;
        default:
          break;
      }
    })
  );
  return result;
}

// ------------------------------------------------------------- Field changes

const FIELD_LABEL: Record<string, string> = {
  firstName: "First name",
  surname: "Surname",
  admissionNo: "Admission no.",
  dob: "Date of birth",
  classId: "Class",
  classTeacherStaffId: "Class teacher",
  staffId: "Teacher",
  studentId: "Student",
  subjectId: "Subject",
  examSubjectId: "Exam subject",
  markedByStaffId: "Marked by",
  marksObtained: "Marks",
  isAbsent: "Absent",
  chargedFee: "Charged fee",
  amount: "Amount",
  status: "Status",
  dueDate: "Due date",
  term: "Term",
  head: "Fee head",
  date: "Date",
  description: "Description",
  category: "Category",
  type: "Type",
  accessLevel: "Access",
  moduleName: "Module",
  primaryMobile: "Primary mobile",
  aadhaarNumber: "Aadhaar",
  routeId: "Route",
  stopId: "Stop",
  vehicleId: "Vehicle",
  title: "Title",
  name: "Name",
  stage: "Stage",
  approvalStatus: "Approval",
  deletedAt: "Deleted",
  rteQuota: "RTE quota",
};

const ID_FIELD_TYPE: Record<string, "class" | "staff" | "student" | "subject" | "examSubject" | "route" | "vehicle"> = {
  classId: "class",
  classTeacherStaffId: "staff",
  staffId: "staff",
  markedByStaffId: "staff",
  studentId: "student",
  subjectId: "subject",
  examSubjectId: "examSubject",
  routeId: "route",
  vehicleId: "vehicle",
};

const humanize = (field: string) => FIELD_LABEL[field] ?? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/ Id$/, "");

function formatValue(field: string, raw: string, names: Map<string, string>): string {
  if (raw === "null" || raw === "undefined" || raw === "") return "—";
  if (field === "aadhaarNumber") return `XXXX XXXX ${raw.slice(-4)}`;
  if (ID_FIELD_TYPE[field]) return names.get(raw) ?? raw;
  if (raw === "true") return "Yes";
  if (raw === "false") return "No";
  if (ATTENDANCE[raw]) return ATTENDANCE[raw]!;
  if (/^(amount|chargedFee|actualFee|value|cost|feeAmount)$/i.test(field) && Number.isFinite(Number(raw))) return formatINR(Number(raw));
  const d = /^\w{3} \w{3} \d{2} \d{4}/.test(raw) || /^\d{4}-\d{2}-\d{2}T/.test(raw) ? new Date(raw) : null;
  if (d && !Number.isNaN(d.getTime())) return formatDateIST(d);
  return raw;
}

const HIDDEN_FIELDS = new Set(["id", "schoolId", "createdAt", "updatedAt", "passwordHash"]);

/**
 * The readable lines for one audit row, without any database lookups: an
 * UPDATE gives "field: before → after"; a DELETE gives the deleted record's
 * fields (`after` empty). Ids are shown as names when `names` has them.
 */
export function describeAuditChanges(action: string, changes: unknown, names: Map<string, string> = new Map()): AuditChange[] {
  if (!changes || typeof changes !== "object") return [];
  if (action === "DELETE") {
    const deleted = (changes as { deleted?: Record<string, unknown> }).deleted;
    if (!deleted || typeof deleted !== "object") return [];
    return Object.entries(deleted)
      .filter(([field, v]) => !HIDDEN_FIELDS.has(field) && v !== null && v !== undefined && v !== "")
      .map(([field, v]) => ({ field: humanize(field), before: formatValue(field, String(v), names), after: "" }));
  }
  if (action !== "UPDATE") return [];
  const list: AuditChange[] = [];
  for (const [field, v] of Object.entries(changes as Record<string, { before?: unknown; after?: unknown }>)) {
    if (!v || typeof v !== "object" || HIDDEN_FIELDS.has(field)) continue;
    list.push({ field: humanize(field), before: formatValue(field, String(v.before ?? ""), names), after: formatValue(field, String(v.after ?? ""), names) });
  }
  return list;
}

function idsInChanges(action: string, changes: unknown): [string, string][] {
  if (!changes || typeof changes !== "object") return [];
  const out: [string, string][] = [];
  if (action === "DELETE") {
    const deleted = (changes as { deleted?: Record<string, unknown> }).deleted ?? {};
    for (const [field, v] of Object.entries(deleted)) if (ID_FIELD_TYPE[field] && typeof v === "string") out.push([ID_FIELD_TYPE[field]!, v]);
  } else if (action === "UPDATE") {
    for (const [field, v] of Object.entries(changes as Record<string, { before?: unknown; after?: unknown }>)) {
      const kind = ID_FIELD_TYPE[field];
      if (!kind || !v || typeof v !== "object") continue;
      for (const id of [v.before, v.after]) if (typeof id === "string" && id && id !== "null") out.push([kind, id]);
    }
  }
  return out;
}

/**
 * Readable changes for UPDATE and DELETE rows ("Class teacher: English
 * Teacher → Office Clerk"), resolving ids in the recorded values to names.
 */
export async function formatAuditChanges(sdb: ScopedDb, rows: { id: string; action: string; changes: unknown }[]): Promise<Map<string, AuditChange[]>> {
  const idsByKind = new Map<string, Set<string>>();
  for (const r of rows) for (const [kind, id] of idsInChanges(r.action, r.changes)) idsByKind.set(kind, new Set([...(idsByKind.get(kind) ?? []), id]));
  const names = new Map<string, string>();
  const ids = (k: string) => [...(idsByKind.get(k) ?? [])];
  await Promise.all([
    ids("class").length && sdb.class.findMany({ where: { id: { in: ids("class") } } }).then((rs) => rs.forEach((c) => names.set(c.id, className(c)))),
    ids("staff").length && sdb.staffProfile.findMany({ where: { id: { in: ids("staff") } }, include: { user: true } }).then((rs) => rs.forEach((s) => names.set(s.id, s.user.name))),
    ids("student").length && sdb.student.findMany({ where: { id: { in: ids("student") } } }).then((rs) => rs.forEach((s) => names.set(s.id, studentName(s)))),
    ids("subject").length && sdb.subject.findMany({ where: { id: { in: ids("subject") } } }).then((rs) => rs.forEach((s) => names.set(s.id, s.name))),
    ids("examSubject").length && sdb.examSubject.findMany({ where: { id: { in: ids("examSubject") } }, include: { exam: true, subject: true } }).then((rs) => rs.forEach((e) => names.set(e.id, `${e.exam.name} · ${e.subject.name}`))),
    ids("route").length && sdb.transportRoute.findMany({ where: { id: { in: ids("route") } } }).then((rs) => rs.forEach((r) => names.set(r.id, r.name))),
    ids("vehicle").length && sdb.transportVehicle.findMany({ where: { id: { in: ids("vehicle") } } }).then((rs) => rs.forEach((v) => names.set(v.id, v.vehicleNo))),
  ]);

  const out = new Map<string, AuditChange[]>();
  for (const r of rows) out.set(r.id, describeAuditChanges(r.action, r.changes, names));
  return out;
}
