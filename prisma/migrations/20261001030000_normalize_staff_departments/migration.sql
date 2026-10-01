-- QA BUG-16: departments become a controlled list (lib/staff.ts). Merge
-- the spelling variants already in use ("Academic" / "Academics" etc.) into
-- the list's names. Only rows whose value is a known variant are changed;
-- anything else is left exactly as it is and stays editable in the app.
UPDATE "staff_profiles" SET "department" = 'Academics'      WHERE lower(trim("department")) IN ('academic', 'academics', 'teaching');
UPDATE "staff_profiles" SET "department" = 'Administration' WHERE lower(trim("department")) IN ('admin', 'administration', 'office');
UPDATE "staff_profiles" SET "department" = 'Accounts'       WHERE lower(trim("department")) IN ('account', 'accounts', 'finance');
UPDATE "staff_profiles" SET "department" = 'Transport'      WHERE lower(trim("department")) = 'transport';
UPDATE "staff_profiles" SET "department" = 'Hostel'         WHERE lower(trim("department")) = 'hostel';
UPDATE "staff_profiles" SET "department" = 'Library'        WHERE lower(trim("department")) = 'library';
UPDATE "staff_profiles" SET "department" = 'Sports'         WHERE lower(trim("department")) IN ('sports', 'physical education');
UPDATE "staff_profiles" SET "department" = 'IT'             WHERE lower(trim("department")) = 'it';
UPDATE "staff_profiles" SET "department" = 'Maintenance'    WHERE lower(trim("department")) = 'maintenance';
UPDATE "staff_profiles" SET "department" = 'Support Staff'  WHERE lower(trim("department")) IN ('support staff', 'support');
