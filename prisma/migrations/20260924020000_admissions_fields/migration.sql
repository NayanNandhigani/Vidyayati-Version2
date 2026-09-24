-- QA fix 1.3: enquiry-stage source/follow-up/notes capture, and a reason
-- field for rejections. All nullable, purely additive — no backfill needed.
ALTER TABLE "admission_enquiries" ADD COLUMN "enquiry_source" TEXT;
ALTER TABLE "admission_enquiries" ADD COLUMN "follow_up_date" TIMESTAMP(3);
ALTER TABLE "admission_enquiries" ADD COLUMN "notes" TEXT;
ALTER TABLE "admission_enquiries" ADD COLUMN "rejection_reason" TEXT;
