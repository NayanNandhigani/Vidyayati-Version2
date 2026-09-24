-- QA fix 1.1: FeeStructure was a class-wide amount that nothing ever
-- generated per-student obligations from, so fee collection was
-- permanently stuck at zero. FeeStructure now stores a fee head and stays
-- a class-level plan (term/amount/dueDate) used only as the weight basis
-- for splitting each student's own chargedFee (or the grade's actualFee)
-- across terms; the new FeeInstalment table holds each student's actual
-- per-term obligation, and FeePayment now links to that instead. See
-- lib/fee-instalments.ts.

-- Fee heads: every existing fee_structures row was implicitly "Tuition"
-- (the only head this app has ever billed).
ALTER TABLE "fee_structures" ADD COLUMN "head" TEXT NOT NULL DEFAULT 'Tuition';
CREATE UNIQUE INDEX "fee_structures_class_id_year_id_head_term_key" ON "fee_structures"("class_id", "year_id", "head", "term");

-- CreateTable
CREATE TABLE "fee_instalments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_instalments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_instalments_student_id_fee_structure_id_key" ON "fee_instalments"("student_id", "fee_structure_id");
CREATE INDEX "fee_instalments_school_id_idx" ON "fee_instalments"("school_id");
CREATE INDEX "fee_instalments_student_id_idx" ON "fee_instalments"("student_id");

ALTER TABLE "fee_instalments" ADD CONSTRAINT "fee_instalments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_instalments" ADD CONSTRAINT "fee_instalments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_instalments" ADD CONSTRAINT "fee_instalments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one FeeInstalment per (student, fee_structure) pair that has
-- at least one existing FeePayment against it. Amount is the greater of
-- the structure's own class-wide amount (the pre-migration meaning of
-- "what's owed") and the sum already paid, so no existing payment can end
-- up exceeding its instalment's amount once this runs — never rewrites a
-- payment, only adds the instalment row it should always have had.
INSERT INTO "fee_instalments" ("id", "school_id", "student_id", "fee_structure_id", "amount")
SELECT
  gen_random_uuid()::text,
  fs."school_id",
  fp."student_id",
  fp."fee_structure_id",
  GREATEST(fs."amount", SUM(fp."amount"))
FROM "fee_payments" fp
JOIN "fee_structures" fs ON fs."id" = fp."fee_structure_id"
GROUP BY fs."school_id", fp."student_id", fp."fee_structure_id", fs."amount";

-- Repoint every existing payment at the instalment it now belongs to.
ALTER TABLE "fee_payments" ADD COLUMN "fee_instalment_id" TEXT;

UPDATE "fee_payments" fp
SET "fee_instalment_id" = fi."id"
FROM "fee_instalments" fi
WHERE fi."student_id" = fp."student_id" AND fi."fee_structure_id" = fp."fee_structure_id";

ALTER TABLE "fee_payments" ALTER COLUMN "fee_instalment_id" SET NOT NULL;

CREATE INDEX "fee_payments_fee_instalment_id_idx" ON "fee_payments"("fee_instalment_id");
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_fee_instalment_id_fkey" FOREIGN KEY ("fee_instalment_id") REFERENCES "fee_instalments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the old direct link from FeePayment to the class-wide FeeStructure.
ALTER TABLE "fee_payments" DROP CONSTRAINT "fee_payments_fee_structure_id_fkey";
ALTER TABLE "fee_payments" DROP COLUMN "fee_structure_id";
