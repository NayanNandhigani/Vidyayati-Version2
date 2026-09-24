-- QA fix 1.4: Student status gains TRANSFERRED/INACTIVE (was just
-- ACTIVE/ALUMNI), a transfer-out date, and StaffProfile gains a soft
-- delete marker. All additive, no backfill needed.
ALTER TYPE "StudentStatus" ADD VALUE 'TRANSFERRED';
ALTER TYPE "StudentStatus" ADD VALUE 'INACTIVE';

ALTER TABLE "students" ADD COLUMN "transfer_out_date" TIMESTAMP(3);
ALTER TABLE "staff_profiles" ADD COLUMN "deleted_at" TIMESTAMP(3);
