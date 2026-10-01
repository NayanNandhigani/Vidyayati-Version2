import { gradeForBands, type GradeBand as ScaleBand } from "./grade-scales";

/** Grade on the built-in default scale (Simple A+ to E) — for screens with no year scale to hand. */
export function gradeFor(pct: number): string {
  return gradeForBands(pct, []);
}

export function gradeColor(grade: string): string {
  if (/^(A\+?|A1|A2)$/.test(grade)) return "var(--good)";
  if (/^(B\+?|B1|B2|C|C1|C2)$/.test(grade)) return "var(--warn)";
  return "var(--critical)";
}

export type GradeBand = ScaleBand;

/** Grade from a school's own scale, matched by lower bound (see lib/grade-scales.ts); null when the school has no scale. */
export function gradeForScale(pct: number, bands: GradeBand[]): string | null {
  return bands.length > 0 ? gradeForBands(pct, bands) : null;
}

export type FeeStatus = "PAID" | "PENDING" | "OVERDUE" | "NONE";

export function feeStatusFor(totalDue: number, totalPaid: number, hasOverdueUnpaid: boolean): FeeStatus {
  if (totalDue === 0) return "NONE";
  if (totalPaid >= totalDue) return "PAID";
  return hasOverdueUnpaid ? "OVERDUE" : "PENDING";
}

export const FEE_STATUS_STYLE: Record<FeeStatus, { bg: string; fg: string; label: string }> = {
  PAID: { bg: "var(--good-tint)", fg: "var(--good)", label: "Paid" },
  PENDING: { bg: "var(--warn-tint)", fg: "var(--warn)", label: "Pending" },
  OVERDUE: { bg: "var(--critical-tint)", fg: "var(--critical)", label: "Overdue" },
  NONE: { bg: "var(--line)", fg: "var(--muted)", label: "No dues set" },
};

const AVATAR_COLORS = ["var(--marigold)", "var(--teal)", "var(--clay)", "#8A6FD1", "#D16F8A", "#4C8FBF", "#3F9B7A", "#C2884A"];

export function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const SUBJECT_PALETTE = [
  { bg: "var(--marigold-tint)", fg: "var(--marigold-deep)" },
  { bg: "var(--teal-tint)", fg: "var(--teal)" },
  { bg: "var(--clay-tint)", fg: "var(--clay)" },
  { bg: "var(--good-tint)", fg: "var(--good)" },
  { bg: "var(--info-tint)", fg: "var(--info)" },
  { bg: "var(--warn-tint)", fg: "var(--warn)" },
];

export function subjectStyleFor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}
