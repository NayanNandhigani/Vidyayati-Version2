// Grade scales: the built-in presets a school can pick (QA BUG-15) and the
// lookup that turns a percentage into a grade.

export type GradeBand = { label: string; minPercent: number; maxPercent: number; remark?: string | null };

export type GradeScalePreset = { key: string; name: string; bands: GradeBand[] };

/** CBSE 9-point scale. Bands are listed with whole-number boundaries as CBSE publishes them. */
export const CBSE_9_POINT: GradeScalePreset = {
  key: "cbse-9-point",
  name: "CBSE 9-point",
  bands: [
    { label: "A1", minPercent: 91, maxPercent: 100, remark: "Outstanding" },
    { label: "A2", minPercent: 81, maxPercent: 90, remark: "Excellent" },
    { label: "B1", minPercent: 71, maxPercent: 80, remark: "Very good" },
    { label: "B2", minPercent: 61, maxPercent: 70, remark: "Good" },
    { label: "C1", minPercent: 51, maxPercent: 60, remark: "Above average" },
    { label: "C2", minPercent: 41, maxPercent: 50, remark: "Average" },
    { label: "D", minPercent: 33, maxPercent: 40, remark: "Below average" },
    { label: "E", minPercent: 0, maxPercent: 32, remark: "Needs improvement" },
  ],
};

/** A simple A+ to E letter scale. */
export const SIMPLE_A_TO_E: GradeScalePreset = {
  key: "simple-a-to-e",
  name: "Simple A+ to E",
  bands: [
    { label: "A+", minPercent: 90, maxPercent: 100, remark: "Outstanding" },
    { label: "A", minPercent: 80, maxPercent: 89, remark: "Excellent" },
    { label: "B+", minPercent: 70, maxPercent: 79, remark: "Very good" },
    { label: "B", minPercent: 60, maxPercent: 69, remark: "Good" },
    { label: "C", minPercent: 50, maxPercent: 59, remark: "Average" },
    { label: "D", minPercent: 33, maxPercent: 49, remark: "Below average" },
    { label: "E", minPercent: 0, maxPercent: 32, remark: "Needs improvement" },
  ],
};

export const GRADE_SCALE_PRESETS: GradeScalePreset[] = [CBSE_9_POINT, SIMPLE_A_TO_E];

/** The scale used when a school hasn't chosen one for the year. */
export const DEFAULT_GRADE_BANDS = SIMPLE_A_TO_E.bands;

/**
 * The grade for a percentage. Bands are matched by their lower bound (the
 * highest band whose minimum is at or below the percentage), so a
 * percentage that falls between published whole-number bands — 90.5% on
 * CBSE's A2 (81–90) / A1 (91–100) — still gets a grade (A2) instead of
 * none. Falls back to the default scale when the given bands are empty.
 */
export function gradeForBands(percentage: number, bands: GradeBand[]): string {
  const scale = bands.length > 0 ? bands : DEFAULT_GRADE_BANDS;
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  const match = sorted.find((b) => percentage >= b.minPercent);
  return (match ?? sorted[sorted.length - 1])!.label;
}
