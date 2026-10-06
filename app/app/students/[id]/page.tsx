import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess, getPermittedClassIds } from "@/lib/permissions";
import { studentName } from "@/lib/format";
import { feeStatusFor, FEE_STATUS_STYLE, gradeFor, gradeForScale } from "@/lib/academic";
import { resultLabel } from "@/lib/exam-rules";
import { getSchoolFeatures } from "@/lib/feature-flags";
import { attendancePercent } from "@/lib/attendance";
import { todayISTDate, todayIST, formatDateIST, dateOnlyString } from "@/lib/ist";
import { maskAadhaar } from "@/lib/indian";
import { getSiblings } from "../depth-actions";
import ProfileTabs from "./ProfileTabs";
import StudentActionsPanel from "./StudentActionsPanel";
import Avatar from "@/components/Avatar";
import ProfilePhotoUpload from "@/components/ProfilePhotoUpload";
import { setStudentPhoto } from "../../settings/id-card-actions";

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("Students", "VIEW");
  const { id } = await params;
  const sdb = await getScopedDb();
  const permittedClassIds = await getPermittedClassIds("Students");

  // findFirst (not findUnique) so a staffer restricted to specific classes
  // can't view a student outside them just by putting the id in the URL.
  const classWhere = permittedClassIds === "ALL" ? {} : { classId: { in: [...permittedClassIds] } };

  const student = await sdb.student.findFirst({
    where: { id, ...classWhere },
    include: {
      class: true,
      parentLinks: { include: { parent: true } },
      transportAssignment: { include: { route: { include: { vehicle: true } }, stop: true } },
      attendance: { orderBy: { date: "desc" }, take: 15 },
      feePayments: { include: { feeInstalment: { include: { feeStructure: true } } }, orderBy: { paidOn: "desc" } },
      feeInstalments: { include: { feeStructure: true, payments: true }, orderBy: { feeStructure: { dueDate: "asc" } } },
      marks: {
        include: { examSubject: { include: { exam: true, subject: true } } },
        orderBy: { examSubject: { exam: { startDate: "desc" } } },
      },
      emergencyContacts: { orderBy: { priority: "asc" } },
      documents: { where: { subjectType: "STUDENT" }, orderBy: { uploadedAt: "desc" } },
      admissionEnquiry: true,
    },
  });
  if (!student) notFound();

  const session = await auth();
  const schoolFeatures = await getSchoolFeatures(session!.user.schoolId!);
  const siblings = schoolFeatures["students.siblings"] ? await getSiblings(student.id) : [];

  const currentYear = await sdb.academicYear.findFirst({ where: { isCurrent: true }, include: { gradeScale: { include: { bands: true } } } });
  const [enrollment, classes] = await Promise.all([
    currentYear ? sdb.enrollment.findUnique({ where: { studentId_academicYearId: { studentId: student.id, academicYearId: currentYear.id } }, select: { rollNumber: true } }) : null,
    sdb.class.findMany({ orderBy: [{ grade: "asc" }, { section: "asc" }] }),
  ]);
  const gradeBands = currentYear?.gradeScale?.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })) ?? [];
  const gradeForPct = (pct: number) => gradeForScale(pct, gradeBands) ?? gradeFor(pct);

  // Plain numbers only: Prisma Decimals can't be passed to the client
  // component below. Overdue is decided here against today's IST date.
  const today = todayISTDate();
  const feeInstalments = student.feeInstalments.map((fi) => {
    const amount = Number(fi.amount);
    const paid = fi.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { id: fi.id, term: fi.feeStructure.term, amount, paid, dueDate: fi.feeStructure.dueDate, overdue: paid < amount && fi.feeStructure.dueDate < today };
  });
  const classFeeDefault = currentYear
    ? await sdb.classFeeDefault.findUnique({ where: { yearId_grade: { yearId: currentYear.id, grade: student.class.grade } } })
    : null;
  const classActualFee = classFeeDefault ? Number(classFeeDefault.actualFee) : null;

  // Attendance stat totals (all recorded days, not just the last 15 shown)
  const [allAttendance, schoolForAttendance] = await Promise.all([
    sdb.attendance.groupBy({ by: ["status"], where: { studentId: student.id }, _count: true }),
    sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { halfDayAttendanceWeight: true } }),
  ]);
  const attendanceTotals = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0 };
  for (const row of allAttendance) attendanceTotals[row.status] = row._count;
  const attendancePct = attendancePercent(attendanceTotals, schoolForAttendance ? Number(schoolForAttendance.halfDayAttendanceWeight) : 0.5);

  // Exam results: complete results come from StudentResult (the shared
  // rules in lib/exam-rules.ts); an exam with only some subjects entered
  // shows as "Incomplete" rather than being scored over what's there.
  const [storedResults, school] = await Promise.all([
    sdb.studentResult.findMany({ where: { studentId: student.id }, include: { exam: true } }),
    sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { examFailLabel: true } }),
  ]);
  const enteredByExam = new Map<string, { name: string; date: Date; entered: number }>();
  for (const mark of student.marks) {
    const exam = mark.examSubject.exam;
    const e = enteredByExam.get(exam.id) ?? { name: exam.name, date: exam.startDate, entered: 0 };
    e.entered += 1;
    enteredByExam.set(exam.id, e);
  }
  const subjectCounts = enteredByExam.size
    ? await sdb.examSubject.groupBy({ by: ["examId"], where: { examId: { in: [...enteredByExam.keys()] } }, _count: { _all: true } })
    : [];
  const subjectCountByExam = new Map(subjectCounts.map((c) => [c.examId, c._count._all]));
  const resultByExam = new Map(storedResults.map((r) => [r.examId, r]));
  const examIds = new Set([...enteredByExam.keys(), ...resultByExam.keys()]);
  const examResults = [...examIds]
    .map((examId) => {
      const r = resultByExam.get(examId);
      if (r) {
        const pct = Number(r.percentage);
        return { examName: r.exam.name, date: r.exam.startDate, total: Number(r.totalMarks), max: Number(r.maxMarks), pct, grade: r.grade ?? gradeForPct(pct), result: resultLabel(r.resultStatus !== "FAIL", school?.examFailLabel), rank: r.rank, status: null as string | null };
      }
      const e = enteredByExam.get(examId)!;
      return { examName: e.name, date: e.date, total: null, max: null, pct: null, grade: null, result: null, rank: null, status: `Incomplete (${e.entered} of ${subjectCountByExam.get(examId) ?? "?"} subjects entered)` };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const latestComplete = examResults.find((e) => e.pct !== null);
  const latestExamPct = latestComplete ? Math.round(latestComplete.pct!) : null;
  const latestExamGrade = latestComplete?.grade ?? null;

  const totalFeeDue = feeInstalments.reduce((s, f) => s + f.amount, 0);
  const totalFeePaid = student.feePayments.reduce((s, p) => s + Number(p.amount), 0);
  const feeStatus = feeStatusFor(totalFeeDue, totalFeePaid, feeInstalments.some((f) => f.overdue));
  const feeStyle = FEE_STATUS_STYLE[feeStatus];

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 16, height: "var(--page-h)", boxSizing: "border-box", overflowY: "auto" }}>
      <div>
        <Link href="/app/students" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none" }}>
          ← Back to Students
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative" }}>
          <Avatar photoPath={student.photoPath} seed={student.id} name={studentName(student)} size={56} fontSize={18} />
          {session!.user.role === "SCHOOL_ADMIN" && <ProfilePhotoUpload onUpload={setStudentPhoto.bind(null, student.id)} />}
        </div>
        <div>
          <div className="disp" style={{ fontSize: 20 }}>
            {studentName(student)}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            Class {student.class.grade}-{student.class.section} · Adm. No. {student.admissionNo}
          </div>
        </div>
      </div>

      {session!.user.role === "SCHOOL_ADMIN" && (
        <StudentActionsPanel
          studentId={student.id}
          fields={{
            firstName: student.firstName,
            surname: student.surname,
            dob: student.dob ? dateOnlyString(student.dob) : "",
            gender: student.gender ?? "",
            fatherName: student.fatherName ?? "",
            motherName: student.motherName ?? "",
            guardianName: student.guardianName ?? "",
            primaryMobile: student.primaryMobile ?? "",
            email: student.email ?? "",
            address: student.address ?? "",
            state: student.state ?? "",
            pinCode: student.pinCode ?? "",
            aadhaarNumber: "", // never sent to the browser; blank keeps the saved number
            apaarId: student.apaarId ?? "",
            category: student.category ?? "",
            religion: student.religion ?? "",
            bloodGroup: student.bloodGroup ?? "",
            previousSchoolName: student.previousSchoolName ?? "",
            admissionDate: student.admissionDate ? dateOnlyString(student.admissionDate) : "",
            rteQuota: student.rteQuota,
            medicalNotes: student.medicalNotes ?? "",
            rollNumber: enrollment?.rollNumber ?? "",
          }}
          aadhaarOnFile={student.aadhaarNumber ? maskAadhaar(student.aadhaarNumber) : null}
          grade={student.class.grade}
          today={todayIST()}
          status={student.status}
          transferOutDate={student.transferOutDate?.toISOString().slice(0, 10) ?? null}
          currentClassId={student.classId}
          classes={classes.map((c) => ({ id: c.id, grade: c.grade, section: c.section }))}
        />
      )}

      {/* Quick info band — basic details, attendance, academic performance at a glance */}
      <div className="card" style={{ padding: 20 }}>
        <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
          <QuickStat label="Attendance" value={attendancePct === null ? "—" : `${attendancePct}%`} color="var(--teal)" />
          <QuickStat label="Latest exam" value={latestExamGrade ?? "—"} sub={latestExamPct !== null ? `${latestExamPct}%` : undefined} />
          <QuickStat label="Fee status" value={feeStyle.label} color={feeStyle.fg} />
        </div>
        <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, fontSize: 12.5 }}>
          <BasicRow label="Date of birth" value={student.dob ? formatDateIST(student.dob) : "—"} />
          <BasicRow label="Gender" value={student.gender ? student.gender[0] + student.gender.slice(1).toLowerCase() : "—"} />
          <BasicRow label="Parent / guardian" value={student.parentLinks[0]?.parent.name ?? "—"} />
          <BasicRow label="Contact" value={student.parentLinks[0]?.parent.phone ?? "—"} mono />
        </div>
      </div>

      <ProfileTabs
        student={{
          id: student.id,
          dob: student.dob,
          gender: student.gender,
          admissionNo: student.admissionNo,
          class: { grade: student.class.grade, section: student.class.section },
          parentLinks: student.parentLinks.map((l) => ({ id: l.id, relation: l.relation, isPrimary: l.isPrimary, parent: { id: l.parent.id, name: l.parent.name, phone: l.parent.phone, preferredContactMethod: l.parent.preferredContactMethod } })),
          transportAssignment: student.transportAssignment
            ? {
                route: { name: student.transportAssignment.route.name, vehicle: student.transportAssignment.route.vehicle ? { driverName: student.transportAssignment.route.vehicle.driverName, vehicleNo: student.transportAssignment.route.vehicle.vehicleNo } : null },
                stop: { stopName: student.transportAssignment.stop.stopName, pickupTime: student.transportAssignment.stop.pickupTime },
              }
            : null,
          attendance: student.attendance.map((a) => ({ date: a.date, status: a.status })),
          feePayments: student.feePayments.map((p) => ({ amount: Number(p.amount), paidOn: p.paidOn })),
          details: {
            fatherName: student.fatherName,
            motherName: student.motherName,
            guardianName: student.guardianName,
            primaryMobile: student.primaryMobile,
            email: student.email,
            address: [student.address, student.state, student.pinCode].filter(Boolean).join(", ") || null,
            aadhaar: student.aadhaarNumber ? maskAadhaar(student.aadhaarNumber) : null,
            apaarId: student.apaarId,
            category: student.category,
            religion: student.religion,
            bloodGroup: student.bloodGroup,
            previousSchoolName: student.previousSchoolName,
            admissionDate: student.admissionDate,
            rteQuota: student.rteQuota,
          },
        }}
        attendancePct={attendancePct}
        attendanceTotals={attendanceTotals}
        examResults={examResults}
        latestExamGrade={latestExamGrade}
        latestExamPct={latestExamPct}
        feeInstalments={feeInstalments}
        features={{
          medicalInfo: schoolFeatures["students.medicalInfo"],
          priorSchool: schoolFeatures["students.priorSchool"],
          siblings: schoolFeatures["students.siblings"],
          documents: schoolFeatures["students.documents"],
        }}
        medical={{ address: student.address, bloodGroup: student.bloodGroup, medicalNotes: student.medicalNotes }}
        emergencyContacts={student.emergencyContacts}
        priorSchool={{
          previousSchoolName: student.previousSchoolName,
          previousTcNo: student.previousTcNo,
          previousTcDate: student.previousTcDate?.toISOString() ?? null,
          priorPerformanceNote: student.priorPerformanceNote,
        }}
        siblings={siblings}
        documents={student.documents.map((d) => ({
          id: d.id,
          category: d.category,
          label: d.label,
          filePath: d.filePath,
          expiryDate: d.expiryDate?.toISOString() ?? null,
          uploadedAt: d.uploadedAt.toISOString(),
        }))}
        admission={
          student.admissionEnquiry
            ? {
                dob: student.admissionEnquiry.dob?.toISOString() ?? null,
                gender: student.admissionEnquiry.gender,
                bloodGroup: student.admissionEnquiry.bloodGroup,
                nationality: student.admissionEnquiry.nationality,
                caste: student.admissionEnquiry.caste,
                religionCategory: student.admissionEnquiry.religionCategory,
                motherTongue: student.admissionEnquiry.motherTongue,
                studentAadhaarNumber: student.admissionEnquiry.studentAadhaarNumber ? maskAadhaar(student.admissionEnquiry.studentAadhaarNumber) : null,
                fatherName: student.admissionEnquiry.fatherName,
                motherName: student.admissionEnquiry.motherName,
                guardianName: student.admissionEnquiry.guardianName,
                fatherOccupation: student.admissionEnquiry.fatherOccupation,
                motherOccupation: student.admissionEnquiry.motherOccupation,
                annualIncome: student.admissionEnquiry.annualIncome,
                parentContact: student.admissionEnquiry.parentContact,
                contactNumber2: student.admissionEnquiry.contactNumber2,
                email: student.admissionEnquiry.email,
                parentAadhaarNumber: student.admissionEnquiry.parentAadhaarNumber ? maskAadhaar(student.admissionEnquiry.parentAadhaarNumber) : null,
                permanentAddress: student.admissionEnquiry.permanentAddress,
                currentAddress: student.admissionEnquiry.currentAddress,
                pincode: student.admissionEnquiry.pincode,
                allergiesConditions: student.admissionEnquiry.allergiesConditions,
                emergencyContactName: student.admissionEnquiry.emergencyContactName,
                emergencyContactNumber: student.admissionEnquiry.emergencyContactNumber,
                familyDoctorContact: student.admissionEnquiry.familyDoctorContact,
                udiseNumber: student.admissionEnquiry.udiseNumber,
                penNumber: student.admissionEnquiry.penNumber,
              }
            : null
        }
        actualFee={classActualFee}
        chargedFee={student.chargedFee != null ? Number(student.chargedFee) : null}
        isAdmin={session!.user.role === "SCHOOL_ADMIN"}
      />
    </div>
  );
}

function QuickStat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: color ?? "var(--ink)" }}>
        {value} {sub && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>({sub})</span>}
      </div>
    </div>
  );
}

function BasicRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div className={mono ? "mono" : undefined} style={{ fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
