# QA fix pass — changelog

Fixes for the 24 Sep 2026 QA findings, by section number. Every commit
below passed `prisma validate`, `tsc --noEmit`, `next lint`, and
`next build`. None were tested against a real database: the sandbox the
work was done in has no `DATABASE_URL`, and it can't reach the deployed
app either. Migrations run on the next deploy through
`scripts/migrate.sh`, the same way every other migration in this project
runs.

Legend: **Fixed**. **Already worked** means the report didn't reproduce
against current code, or the thing already existed; it was checked, not
changed. **Deferred** means it was left out on purpose, for the reason
given.

## Priority 1: Blockers

| # | Status | Commit | Notes |
|---|---|---|---|
| 1.1 Fees: no instalments | Fixed, then tested | `9d84b8e`, follow-up below | New `FeeInstalment` model, one row per student per term, split in proportion to the charged fee. Instalment plan editor added under Fee Structure. Generation runs on admit and whenever the charged fee is edited. |
| 1.2 Payroll duplicate Accounts entry | Fixed | `6f0a647` | Accounts rows are now linked to their payroll run by a unique `payrollRunId`, and a re-run edits the existing row instead of adding a second one. `npm run dedupe-payroll-accounts` removes duplicates that already exist. |
| 1.3 Admissions data loss | Fixed | `00e58f2` | The basic admit flow was removed, so the detailed flow (previously behind an off-by-default flag) is the only one. Admitting now creates the Parent/Guardian record, and cards can be edited, rejected with a reason, and deleted. |
| 1.4 Students/Employees uneditable | Fixed | `4c2694b` | Edit, status change, section transfer, soft delete and guardian management for students. Bulk promote. Edit, deactivate, reset password and soft delete for employees. |

## Priority 2: Data correctness

| # | Status | Commit | Notes |
|---|---|---|---|
| 2.1 Timetable | Fixed | `e7afa00` | Teacher clash detection with an override. Fixed the stale grid when switching classes. A "By teacher" view was added afterwards (see below). Deferred: teacher-dropdown ordering, period timings. |
| 2.2 Homework | Fixed | `39a9a0d` | One shared bucket classifier, so the board and the tiles now agree. Added an Overdue column. Scoring now moves the status. Added configurable `maxMarks`, edit/delete, and A–Z sorting. |
| 2.3 Exams | Fixed | `39a9a0d` | The "unentered mark counts as 0" bug existed in three separate places; all three now read from one source. Added Absent, per-subject pass marks with a Pass/Fail result, and Delete. Deferred: per-subject exam times, maker-checker setting. |
| 2.4 Admission numbers | Fixed | `c8343c0` | One tenant-level sequence (highest existing number + 1) that honours the configured prefix. |
| 2.5 Accounts | Fixed | `c8343c0` | Separate income categories. Edit/delete for manual rows only. Deferred: currency as a tenant setting (affects every ₹ in the app). |
| 2.6 Transport | Partly fixed | `c8343c0` | Already worked: the raw error, the stale list, and the per-vehicle compliance badges. Added a Dashboard compliance alert, a Cancel button, and a warning when an expiry date has already passed. Deferred: linking drivers to employee records. |
| 2.7 Dashboard | Fixed | `c8343c0` | "Net, last month" label corrected (the figure was always the current month). Staff counts and exam averages were fixed by 1.4 and 2.3. |
| 2.8 Attendance | Fixed | `c8343c0` | Warns before leaving the page with unsaved or in-progress changes. Half-day weight is a per-school setting (default 0.5). Added admin staff attendance marking, which previously had no way to save data. Deferred: true batch writes (the audit log needs per-row writes). |

## Priority 3: Input validation

Fixed in `dad9c85`: class grade/section, fee amounts, event cost, student
and staff DOB, and phone numbers on staff, vehicle and emergency-contact
forms. Exam dates, homework due dates, vehicle expiry warnings and the
duplicate admission number message were already fixed in Priorities 1–2.
The "form clears after an error" report did not reproduce.

## Priority 4: Safety, UX and performance

| # | Status | Commit | Notes |
|---|---|---|---|
| 4.1 Delete confirmations | Fixed | `6b83d0b` | Class and Library-book delete now ask for confirmation. Library books are soft-deleted, which keeps their issue history. Deferred: archiving a class instead of blocking the delete. |
| 4.2 Edit/delete gaps | Fixed | `6b83d0b` | Events edit/delete. Announcements can be edited while pending and withdrawn after publishing. |
| 4.3 Refresh gaps | Fixed | `6b83d0b` | The Events checklist had the same stale-state bug as the timetable; now fixed. Hostel and Communication already refreshed correctly. |
| 4.4 Friendly errors | Fixed | `6b83d0b` | `app/error.tsx` added. The app previously had no error boundary anywhere. |
| 4.5 Performance | Deferred | none | Profiling and indexing need a live database. |
| 4.6 Small UI fixes | Partly fixed | none | Homework sorting and the Admissions header were fixed in 2.2 and 1.3. Communication input sizing and hostel colours did not reproduce. The "Lead Image" certificate template is a data row, not code (see Priority 8). Deferred: real template thumbnails. |

## Priority 5: Missing modules

| # | Status | Notes |
|---|---|---|
| 5.1 Teaching | Hidden from the sidebar (`235664c`) | It was an empty placeholder. The QA prompt allowed hiding it instead of building it. |
| 5.2 Staff leave | Already built, behind a flag | Leave requests, approvals and balances exist behind `employees.leave`. No "On leave" dashboard tile exists yet. |
| 5.3 Guardians | Mostly fixed by 1.3/1.4 | Admitting a student and "Add guardian" now create real parent logins. |
| 5.4 SMS/WhatsApp | Not built | Explicitly on hold per `claude.md`. |
| 5.5–5.8 | Deferred | Library staff borrowers, multi-day events, Settings → General, moving academic years. All are new features. |

## Priority 6: Security (fixed in `235664c`)

- The setup token no longer appears in the URL in any of the 5 places
  that put it there. It is now passed in a short-lived httpOnly cookie
  (`lib/setup-token-flash.ts`).
- Removed the incorrect "Default password: 12345" text from both Add
  Staff forms.
- Password resets already require a change at first login. Tenant
  isolation and server-side permission checks were already in place
  (verified).
- Automated permission tests were not added because the project has no
  test runner configured.

## Priority 7: Audit log (fixed in `28f13e8`)

- Rows now show readable labels and links for the main record types.
  Deleted rows are labelled from their stored snapshot.
- Before→after values were already recorded and shown (verified).
- Added the missing modules to the audit list: classes, subjects,
  library, events, announcements, transport.
- Changes to School settings are still not audited. Doing that means
  changing the tenant-isolation extension (`lib/tenant-db.ts`), which
  was left untouched on purpose.

## Priority 8: Test data on the test tenant

None of this can be done from code; it needs the live database. After
deploying:
- Run `npm run dedupe-payroll-accounts` (add `--apply` to delete) to
  remove QA Maths Teacher's duplicate September payroll entry.
- Everything else in the section 8 list (6-B, QA Mathematics, QA
  Student One/Direct Two, QA Homework, QA BUS 01, QA Sports Day, the
  "Lead Image" certificate template, and so on) can be edited or deleted
  from the app, now that Priorities 1–4 added edit/delete to those
  screens.

## Priority 9: Definition of done

- [x] All migrations are additive and backfill existing data. No
  destructive schema changes.
- [x] No form accepts the inputs listed in the validation table.
- [x] Every delete asks for confirmation. Audit coverage is extended,
  apart from the School settings gap above.
- [x] A global error boundary means no page shows a raw server error.
- [x] Server-side permission checks are present on every action added in
  this pass (spot-checked).
- [ ] "How to verify" steps run against a real deploy: **not done.** No
  database or deployed-app access from the sandbox.
- [ ] Typical saves under 2 seconds: **not measured.** Needs a live
  database.
- [ ] Automated tests: **not added.** No test runner is configured.

## Follow-ups

- **Teacher timetable view (from 2.1).** The Timetable page has a "By
  class / By teacher" switch. The teacher view shows one teacher's week
  across every class, read-only, with the class name in each cell. An
  overridden clash shows both classes in the same cell and is marked
  "(clash)". A staffer always sees their own week in full, even with no
  class access. Other teachers' slots are limited to the classes the
  viewer may see. Deleted staff are no longer offered in the teacher
  pickers.

- **Fees (1.1) tested end to end, and five bugs fixed.** Tested against a
  local PostgreSQL database, not in the sandbox-only way the other
  commits were. All migrations apply to an empty database and match the
  schema exactly. The fee migration was also run on a database holding
  old-style payments: every payment was kept and linked to an
  instalment. 22 fee scenarios pass using the real code, and the Fee
  Structure and Fees screens were driven in a browser on a production
  build. Fixed:
  - Moving a student to another section billed them twice. Unpaid
    instalments from the old section are now removed; a term already
    paid there is not billed again.
  - Removing or renaming a term in the instalment plan left the old term
    on every student's bill. It is now removed, unless payments exist
    against it, in which case the save is refused with a message naming
    the term.
  - Changing a grade's actual fee didn't update the instalments of
    students billed from it.
  - Terms didn't always add up to the fee (₹10,000 over three terms
    billed ₹9,999). The last term now takes the remainder.
  - A payment bigger than one term was refused. It is now spread over
    the oldest unpaid terms, with one Accounts entry for the full amount.
  - Also: promoting a class now bills the new class's fee plan straight
    away; setting a student's charged fee to 0, or removing a
    transport/hostel assignment, removes the matching unpaid instalments;
    and instalment-plan errors now reach the admin instead of Next.js's
    generic production error.
