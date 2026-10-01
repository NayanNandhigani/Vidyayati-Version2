-- QA BUG-27: school phone and email for the General settings form.
-- Additive and nullable: no existing row or column is changed.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "email" TEXT;
