-- QA fix 4.2: announcements had no way to withdraw one after it was
-- published (only reject before). Additive, no backfill needed.
ALTER TABLE "announcements" ADD COLUMN "withdrawn_at" TIMESTAMP(3);
