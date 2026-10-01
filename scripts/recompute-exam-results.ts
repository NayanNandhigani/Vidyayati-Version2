/**
 * Recalculates every exam's stored results (StudentResult) with the shared
 * rules in lib/exam-rules.ts (QA BUG-13/14): only complete results are
 * ranked, ties share a rank, a failed subject fails the result. Safe to
 * run any time — results are a snapshot of the marks, which aren't
 * touched. The Grades tab and report-card PDF also recalculate an exam on
 * first open, so this is only needed to refresh everything at once.
 *
 *   npm run recompute-exam-results
 */
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/tenant-db";
import { calculateExamResults } from "@/lib/domain/exam-results";

async function main() {
  const exams = await db.exam.findMany({ select: { id: true, name: true, schoolId: true } });
  let done = 0;
  for (const exam of exams) {
    const r = await calculateExamResults(exam.id, scopedDb(exam.schoolId));
    done += 1;
    console.log(`${exam.name}: ${r.computed} complete result(s)`);
  }
  console.log(`Recalculated ${done} exam(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
