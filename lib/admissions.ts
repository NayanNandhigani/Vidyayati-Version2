// One definition of where an enquiry sits in the admissions pipeline, used
// for both the column it's listed in and the counts above the board (QA
// BUG-20: the counts were cumulative "reached this stage" totals while the
// columns showed the current stage, so 2 admitted students read as
// "Enquiries 2 → Applications 2 → Admitted 2" over empty columns).

export type PipelineStage = "ENQUIRY" | "APPLICATION" | "ADMITTED" | "REJECTED";

export function pipelineStage(e: { stage: string; approvalStatus?: string | null }): PipelineStage {
  if (e.approvalStatus === "REJECTED") return "REJECTED";
  if (e.stage === "ADMITTED") return "ADMITTED";
  if (e.stage === "APPLICATION") return "APPLICATION";
  return "ENQUIRY";
}

export type PipelineCounts = Record<PipelineStage, number> & { total: number; conversionPct: number };

/** Counts per current stage — exactly the number of cards in each column. Conversion is admitted ÷ all enquiries. */
export function pipelineCounts(enquiries: { stage: string; approvalStatus?: string | null }[]): PipelineCounts {
  const counts: Record<PipelineStage, number> = { ENQUIRY: 0, APPLICATION: 0, ADMITTED: 0, REJECTED: 0 };
  for (const e of enquiries) counts[pipelineStage(e)] += 1;
  const total = enquiries.length;
  return { ...counts, total, conversionPct: total ? Math.round((counts.ADMITTED / total) * 100) : 0 };
}
