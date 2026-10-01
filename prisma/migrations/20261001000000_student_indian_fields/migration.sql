-- QA BUG-06: fields Indian schools record for every student. Additive
-- only: every new column is nullable (or has a default), so existing
-- student rows are untouched and stay valid.
CREATE TYPE "StudentCategory" AS ENUM ('GENERAL', 'OBC', 'SC', 'ST', 'EWS');

ALTER TABLE "students"
  ADD COLUMN "father_name" TEXT,
  ADD COLUMN "mother_name" TEXT,
  ADD COLUMN "guardian_name" TEXT,
  ADD COLUMN "primary_mobile" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "pin_code" TEXT,
  ADD COLUMN "aadhaar_number" TEXT,
  ADD COLUMN "apaar_id" TEXT,
  ADD COLUMN "category" "StudentCategory",
  ADD COLUMN "religion" TEXT,
  ADD COLUMN "admission_date" DATE,
  ADD COLUMN "rte_quota" BOOLEAN NOT NULL DEFAULT false;
