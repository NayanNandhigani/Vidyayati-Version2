-- School logo shown in the portal header next to the school name.
-- Additive and nullable: no existing row or column is changed.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "logo_path" TEXT;
