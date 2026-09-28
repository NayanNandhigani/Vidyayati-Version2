-- QA fix 4.1/4.2: deleting a library title cascade-deleted its whole
-- circulation history (returned copies included, not just active loans).
-- Soft delete instead — existing rows are unaffected (all NULL = "not
-- deleted").
ALTER TABLE "library_books" ADD COLUMN "deleted_at" TIMESTAMP(3);
