-- Password workflow: accounts start on a known initial password that an
-- admin can see until the user sets their own. Additive only: two new
-- columns with safe defaults; no existing row's password is changed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "uses_initial_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);
