// The single definition of how exam marks become results. Every place that
// shows a total, percentage, grade, rank, average or pass/fail — the
// results calculator, the Grades tab, the marks grid preview, report cards,
// the student profile, the dashboard chart and Reports — uses these, so
// they can't disagree (QA BUG-13/14).
//
// Rules:
// - A subject with no mark is "not entered" (shown "—"), never zero.
// - Absent (AB) is shown "AB"; it counts as 0 marks and fails that subject.
// - A student's result is COMPLETE only when every subject is entered (a
//   mark or AB). Only complete results get a total, percentage, grade and
//   rank and count towards class averages; others are "Incomplete".
// - Equal totals share a rank, standard competition style: 1, 2, 2, 4.
// - A subject below its pass mark (default 33% of its maximum when the
//   exam doesn't set one) fails; any failed subject makes the overall
//   result a fail, whatever the percentage.

import { gradeForBands, type GradeBand } from "./grade-scales";

export const DEFAULT_PASS_PERCENT = 33;
export const DEFAULT_FAIL_LABEL = "Needs improvement";

export type SubjectSpec = { id: string; maxMarks: number; passMarks: number | null };
export type MarkCell = { obtained: number | null; absent: boolean };

export type StudentEvaluation =
  | { status: "NOT_STARTED"; entered: 0; of: number }
  | { status: "INCOMPLETE"; entered: number; of: number; failedSubjectIds: string[] }
  | { status: "COMPLETE"; entered: number; of: number; total: number; max: number; percentage: number; failedSubjectIds: string[]; absentSubjectIds: string[]; passed: boolean };

export function passMarkFor(s: SubjectSpec): number {
  return s.passMarks ?? Math.ceil((s.maxMarks * DEFAULT_PASS_PERCENT) / 100);
}

/** Has this subject been failed? Absent fails; not entered isn't decided yet (null). */
export function subjectFailed(s: SubjectSpec, cell: MarkCell | undefined): boolean | null {
  if (!cell) return null;
  if (cell.absent || cell.obtained === null) return true;
  return cell.obtained < passMarkFor(s);
}

export function evaluateStudent(subjects: SubjectSpec[], cells: Map<string, MarkCell> | Record<string, MarkCell | undefined>): StudentEvaluation {
  const get = (id: string) => (cells instanceof Map ? cells.get(id) : cells[id]);
  let entered = 0;
  let total = 0;
  let max = 0;
  const failedSubjectIds: string[] = [];
  const absentSubjectIds: string[] = [];
  for (const s of subjects) {
    const cell = get(s.id);
    if (!cell) continue;
    entered += 1;
    max += s.maxMarks;
    if (cell.absent || cell.obtained === null) absentSubjectIds.push(s.id);
    else total += cell.obtained;
    if (subjectFailed(s, cell)) failedSubjectIds.push(s.id);
  }
  const of = subjects.length;
  if (entered === 0) return { status: "NOT_STARTED", entered: 0, of };
  if (entered < of) return { status: "INCOMPLETE", entered, of, failedSubjectIds };
  const percentage = max > 0 ? (total / max) * 100 : 0;
  return { status: "COMPLETE", entered, of, total, max, percentage, failedSubjectIds, absentSubjectIds, passed: failedSubjectIds.length === 0 };
}

/** Competition ranking on total marks: equal totals share a rank and the next rank skips (1, 2, 2, 4). */
export function competitionRanks(items: { id: string; total: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.total - a.total);
  const ranks = new Map<string, number>();
  let prevTotal: number | null = null;
  let prevRank = 0;
  sorted.forEach((item, i) => {
    const rank = prevTotal !== null && Math.abs(item.total - prevTotal) < 1e-9 ? prevRank : i + 1;
    ranks.set(item.id, rank);
    prevTotal = item.total;
    prevRank = rank;
  });
  return ranks;
}

/** Average percentage for one subject across the marks actually entered (absent and not-entered are left out). Null when nothing is entered. */
export function subjectAveragePercent(maxMarks: number, cells: (MarkCell | undefined)[]): number | null {
  const scored = cells.filter((c): c is MarkCell => !!c && !c.absent && c.obtained !== null);
  if (scored.length === 0 || maxMarks <= 0) return null;
  return (scored.reduce((sum, c) => sum + (c.obtained as number), 0) / (scored.length * maxMarks)) * 100;
}

/** Class average: the mean percentage of complete results only. Null when none are complete. */
export function classAveragePercent(percentages: number[]): number | null {
  if (percentages.length === 0) return null;
  return percentages.reduce((a, b) => a + b, 0) / percentages.length;
}

/** The overall result to show: "Pass", or the school's fail label (default "Needs improvement"). */
export function resultLabel(passed: boolean, failLabel?: string | null): string {
  return passed ? "Pass" : failLabel?.trim() || DEFAULT_FAIL_LABEL;
}

/** Grade for a complete result's percentage from the year's scale (or the built-in default scale). */
export function gradeForResult(percentage: number, bands: GradeBand[]): string {
  return gradeForBands(percentage, bands);
}

/** How one subject's mark reads on screen: "—" not entered, "AB" absent, else the number. */
export function formatMark(cell: MarkCell | undefined): string {
  if (!cell) return "—";
  if (cell.absent || cell.obtained === null) return "AB";
  return String(cell.obtained);
}
