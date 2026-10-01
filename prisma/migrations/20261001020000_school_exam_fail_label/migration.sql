-- QA BUG-14: a school can name the overall result shown when a subject is
-- failed (default "Needs improvement"). Nullable; additive only.
ALTER TABLE "schools" ADD COLUMN "exam_fail_label" TEXT;
