-- QA fix 2.2: score was hardcoded to "out of 10" everywhere; homework
-- now carries its own configurable max marks (existing rows default to
-- the same 10 they were already implicitly capped at).
ALTER TABLE "homework" ADD COLUMN "max_marks" INTEGER NOT NULL DEFAULT 10;
