-- QA BUG-17: a class whose class teacher has since been deleted (soft
-- delete, staff_profiles.deleted_at) showed "Unassigned" in Academic
-- Management but the old name on the Timetable. Deleting staff now clears
-- the assignment; this applies the same rule to anyone already deleted.
-- Only class_teacher_staff_id is touched; the staff record is kept.
UPDATE "classes" c
SET "class_teacher_staff_id" = NULL
FROM "staff_profiles" sp
WHERE c."class_teacher_staff_id" = sp."id" AND sp."deleted_at" IS NOT NULL;
