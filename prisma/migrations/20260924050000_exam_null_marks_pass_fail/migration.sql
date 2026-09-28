-- QA fix 2.3: a student with no Mark row was being treated as scoring 0
-- and ranked/graded alongside everyone else. Marks stay a per-row concept
-- (no row = not entered, unchanged), but marksObtained becomes nullable
-- so an explicit "Absent" can be recorded distinctly from a real 0, and
-- ExamSubject/StudentResult gain pass/fail support.

ALTER TABLE "exam_subjects" ADD COLUMN "pass_marks" INTEGER;

ALTER TABLE "marks" ALTER COLUMN "marks_obtained" DROP NOT NULL;
ALTER TABLE "marks" ADD COLUMN "is_absent" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ExamResultStatus" AS ENUM ('PASS', 'FAIL');
ALTER TABLE "student_results" ADD COLUMN "result_status" "ExamResultStatus";
