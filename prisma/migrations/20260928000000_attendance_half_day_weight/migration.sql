-- QA fix 2.8: half-day used to always count as 0 (fully absent) in every
-- attendance percentage — now configurable per school, defaulting to 0.5
-- (half-present), matching what every school already assumed it meant.
ALTER TABLE "schools" ADD COLUMN "half_day_attendance_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.5;
