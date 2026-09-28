/**
 * A half-day used to always count as 0 (fully absent) in every displayed
 * attendance rate — this is the one shared formula every screen that
 * shows an attendance % should call, using the school's configured
 * halfDayAttendanceWeight (default 0.5) instead of dropping half-days
 * from the numerator.
 */
export function attendancePercent(
  counts: { PRESENT: number; ABSENT: number; HALF_DAY: number },
  halfDayWeight = 0.5
): number | null {
  const total = counts.PRESENT + counts.ABSENT + counts.HALF_DAY;
  if (total === 0) return null;
  const weighted = counts.PRESENT + counts.HALF_DAY * halfDayWeight;
  return Math.round((weighted / total) * 100);
}
