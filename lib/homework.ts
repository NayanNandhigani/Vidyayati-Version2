// Plain utility, not a server action — kept out of app/app/homework/depth-actions.ts
// because a "use server" file requires every export to be an async function.

/** Purely a display computation — never writes to the stored status. */
export function effectiveStatus(
  status: "PENDING" | "SUBMITTED" | "LATE",
  dueDate: Date,
  graceDays: number | null
): "PENDING" | "SUBMITTED" | "LATE" {
  if (status !== "PENDING" || graceDays == null) return status;
  const graceDeadline = new Date(dueDate);
  graceDeadline.setDate(graceDeadline.getDate() + graceDays);
  return new Date() > graceDeadline ? "LATE" : "PENDING";
}

export type HomeworkBucket = "Overdue" | "Assigned" | "Due this week" | "Submitted" | "Graded";

/**
 * The single source of truth for which board column (and which dashboard
 * tile) an assignment falls into — used by both HomeworkBoard's columns
 * and the page's stat tiles, so they can never disagree the way they used
 * to (an overdue assignment used to fall through both "Active" and "Due
 * this week" while the board silently lumped it into "Due this week").
 */
export function classifyHomework(dueDate: Date, submissions: { status: "PENDING" | "SUBMITTED" | "LATE"; score: number | null }[]): HomeworkBucket {
  const total = submissions.length;
  const graded = submissions.filter((s) => s.score !== null).length;
  const submitted = submissions.filter((s) => s.status === "SUBMITTED" || s.status === "LATE").length;
  if (total > 0 && graded === total) return "Graded";
  if (total > 0 && submitted === total) return "Submitted";
  const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "Overdue";
  if (daysUntil <= 7) return "Due this week";
  return "Assigned";
}
