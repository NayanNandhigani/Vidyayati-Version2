"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, SubmissionStatus } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { parseDateOnly, todayIST } from "@/lib/ist";

export type HomeworkFormState = { error?: string };

export async function createHomework(_prevState: HomeworkFormState, formData: FormData): Promise<HomeworkFormState> {
  const title = formData.get("title");
  const description = formData.get("description");
  const classId = formData.get("classId");
  const subjectId = formData.get("subjectId");
  const dueDate = formData.get("dueDate");

  const maxMarksRaw = formData.get("maxMarks");

  if (
    typeof title !== "string" || !title.trim() ||
    typeof classId !== "string" || !classId ||
    typeof subjectId !== "string" || !subjectId ||
    typeof dueDate !== "string" || !dueDate
  ) {
    return { error: "Title, class, subject, and due date are required." };
  }

  // Compared as IST calendar dates — today (India) is allowed, yesterday isn't.
  if (!parseDateOnly(dueDate)) return { error: "Due date isn't a valid date." };
  if (dueDate < todayIST()) {
    return { error: "Due date can't be in the past." };
  }

  const maxMarks = typeof maxMarksRaw === "string" && maxMarksRaw ? Number(maxMarksRaw) : 10;
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    return { error: "Max marks must be a positive number." };
  }

  await requireModuleAccess("Homework", "EDIT", classId);
  const session = await auth();
  const sdb = await getScopedDb();

  const staffProfile =
    session!.user.role === "STAFF" ? await db.staffProfile.findUnique({ where: { userId: session!.user.id } }) : null;

  if (session!.user.role === "STAFF" && !staffProfile) {
    return { error: "Staff profile not found." };
  }

  // classId/subjectId are client-supplied form fields — validate they
  // belong to this school before anything gets created against them.
  const cls = await sdb.class.findUnique({ where: { id: classId } });
  if (!cls) return { error: "That class could not be found." };
  const subject = await sdb.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!subject) return { error: "That subject could not be found." };

  // A Staff member's own homework is always attributed to themselves. A
  // School Admin has no staff record of their own, so the form asks them
  // to pick which teacher it should show as — defaulting to the class's
  // own class teacher when one is set, but not requiring it (many schools
  // haven't assigned class teachers to every section).
  let staffId = staffProfile?.id;
  if (!staffId) {
    const submittedStaffId = formData.get("staffId");
    if (typeof submittedStaffId === "string" && submittedStaffId) {
      const submittedStaff = await sdb.staffProfile.findUnique({ where: { id: submittedStaffId }, select: { id: true } });
      if (!submittedStaff) return { error: "That teacher could not be found." };
      staffId = submittedStaffId;
    } else {
      staffId = cls.classTeacherStaffId ?? undefined;
    }
  }
  if (!staffId) {
    return { error: "Select which teacher this assignment should be attributed to." };
  }

  const homework = await sdb.homework.create({
    data: scopedCreateData<Prisma.HomeworkUncheckedCreateInput>({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      classId,
      subjectId,
      staffId,
      dueDate: parseDateOnly(dueDate)!,
      maxMarks,
    }),
  });

  const students = await sdb.student.findMany({ where: { classId, status: "ACTIVE" }, select: { id: true } });
  if (students.length > 0) {
    await sdb.homeworkSubmission.createMany({
      data: students.map((s) =>
        scopedCreateData<Prisma.HomeworkSubmissionUncheckedCreateInput>({ assignmentId: homework.id, studentId: s.id })
      ),
    });
  }

  revalidatePath("/app/homework");
  redirect(`/app/homework?assignment=${homework.id}`);
}

export async function cycleSubmissionStatus(submissionId: string) {
  const sdb = await getScopedDb();
  const sub = await sdb.homeworkSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: { select: { classId: true } } } });
  await requireModuleAccess("Homework", "EDIT", sub.assignment.classId);

  const cycle: SubmissionStatus[] = ["PENDING", "SUBMITTED", "LATE"];
  const next = cycle[(cycle.indexOf(sub.status) + 1) % cycle.length];

  await sdb.homeworkSubmission.update({
    where: { id: submissionId },
    data: { status: next, submittedOn: next === "PENDING" ? null : (sub.submittedOn ?? new Date()) },
  });

  revalidatePath("/app/homework");
  return { status: next };
}

export async function setSubmissionScore(submissionId: string, score: number): Promise<{ error?: string }> {
  const sdb = await getScopedDb();
  const sub = await sdb.homeworkSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: { select: { classId: true, maxMarks: true } } } });
  await requireModuleAccess("Homework", "EDIT", sub.assignment.classId);
  if (score < 0 || score > sub.assignment.maxMarks) {
    return { error: `Score must be between 0 and ${sub.assignment.maxMarks}.` };
  }
  // Scoring a submission implies it was submitted — a teacher grading
  // something the board still showed as "Pending" shouldn't leave it
  // stuck there (this was the "grading doesn't work" bug: score saved,
  // status never moved, so the board/tiles never reflected it).
  await sdb.homeworkSubmission.update({
    where: { id: submissionId },
    data: { score, status: sub.status === "PENDING" ? "SUBMITTED" : sub.status, submittedOn: sub.submittedOn ?? new Date() },
  });
  revalidatePath("/app/homework");
  return {};
}

export type HomeworkEditFields = { title: string; description: string; dueDate: string; maxMarks: number };

/** Editing an existing assignment — unlike createHomework, a past due date is allowed here (the QA ask is specifically "block on create, allow on edit"). */
export async function updateHomework(homeworkId: string, fields: HomeworkEditFields): Promise<{ error?: string }> {
  const sdb = await getScopedDb();
  const homework = await sdb.homework.findUniqueOrThrow({ where: { id: homeworkId }, select: { classId: true } });
  await requireModuleAccess("Homework", "EDIT", homework.classId);

  if (!fields.title.trim()) return { error: "Title is required." };
  if (!fields.dueDate || Number.isNaN(Date.parse(fields.dueDate))) return { error: "Due date isn't valid." };
  if (!Number.isFinite(fields.maxMarks) || fields.maxMarks <= 0) return { error: "Max marks must be a positive number." };

  await sdb.homework.update({
    where: { id: homeworkId },
    data: { title: fields.title.trim(), description: fields.description.trim() || null, dueDate: new Date(fields.dueDate), maxMarks: fields.maxMarks },
  });
  revalidatePath("/app/homework");
  return {};
}

/** Deletes an assignment and its per-student submissions (cascades) — the client asks for confirmation before calling this. */
export async function deleteHomework(homeworkId: string) {
  const sdb = await getScopedDb();
  const homework = await sdb.homework.findUniqueOrThrow({ where: { id: homeworkId }, select: { classId: true } });
  await requireModuleAccess("Homework", "EDIT", homework.classId);
  await sdb.homework.delete({ where: { id: homeworkId } });
  revalidatePath("/app/homework");
}

export async function remindPending(assignmentId: string) {
  const sdb = await getScopedDb();

  const homework = await sdb.homework.findUniqueOrThrow({ where: { id: assignmentId } });
  await requireModuleAccess("Homework", "EDIT", homework.classId);
  const pending = await sdb.homeworkSubmission.findMany({ where: { assignmentId, status: "PENDING" } });

  if (pending.length === 0) return { remindedCount: 0 };

  await sdb.announcement.createMany({
    data: pending.map((p) =>
      scopedCreateData<Prisma.AnnouncementUncheckedCreateInput>({
        title: "Homework reminder",
        body: `"${homework.title}" is due ${homework.dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} and hasn't been submitted yet.`,
        audienceType: "SPECIFIC_STUDENT",
        audienceTarget: p.studentId,
        publishedOn: new Date(),
      })
    ),
  });

  revalidatePath("/app/homework");
  return { remindedCount: pending.length };
}
