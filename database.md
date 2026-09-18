# Database — Vidyayati 2.0

Full field-level reference for every table in `prisma/schema.prisma`, grouped by domain. Generated directly from the schema so it can't drift silently — regenerate whenever the schema changes (see `memory.md`). Multi-tenancy: every model below that isn't platform-level carries a `schoolId` field, enforced centrally — see `Architecture.md` → "Multi-tenancy enforcement".

**107 models, 63 enums** across 13 domains.

## Domains at a glance

| Domain | Models | Enums |
|---|---|---|
| Platform & Billing | 9 | 6 |
| Sales Pipeline | 2 | 3 |
| Contracts | 1 | 1 |
| School Documents | 2 | 1 |
| Platform Accounting | 4 | 5 |
| People & Access | 7 | 6 |
| Academics | 29 | 10 |
| Finance | 11 | 8 |
| Admissions | 1 | 2 |
| Operations — Transport, Hostel & Library | 20 | 10 |
| Operations — Inventory & Assets | 9 | 3 |
| Engagement | 6 | 4 |
| Settings | 6 | 4 |

## Platform & Billing

**`SchoolStatus`** (enum): `TRIAL`, `ACTIVE`, `EXPIRING`, `OVERDUE`, `CANCELLED`

**`SalesStage`** (enum): `LEAD`, `DEMO_SCHEDULED`, `PROPOSAL_SENT`, `NEGOTIATION`, `WON`

**`ActivityType`** (enum): `LOGIN`, `PAGE_VIEW`

**`MutationAction`** (enum): `CREATE`, `UPDATE`, `DELETE`

**`InvoiceStatus`** (enum): `PENDING`, `PAID`, `OVERDUE`

**`BillingCycle`** (enum): `MONTHLY`, `ANNUAL`

### `School`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `code` | `String` | @unique |
| `name` | `String` |  |
| `city` | `String?` |  |
| `state` | `String?` |  |
| `status` | `SchoolStatus` | @default(TRIAL) |
| `relationshipManager` | `String?` | @map("relationship_manager") // doubles as "account owner" for the sales pipeline — one field, not two |
| `salesStage` | `SalesStage` | @default(WON) @map("sales_stage") // WON = has gone through onboarding (has a School Admin login); pre-WON stages are pipeline-only prospects with no portal access yet |
| `leadSource` | `String?` | @map("lead_source") |
| `lastContactedAt` | `DateTime?` | @map("last_contacted_at") |
| `nextFollowUpAt` | `DateTime?` | @map("next_follow_up_at") |
| `onboardedOn` | `DateTime` | @default(now()) @map("onboarded_on") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |
| `registrationNumber` | `String?` | @unique @map("registration_number") |
| `addressLine` | `String?` | @map("address_line") |
| `mandal` | `String?` |  |
| `district` | `String?` |  |
| `country` | `String?` | @default("India") |
| `postalCode` | `String?` | @map("postal_code") |
| `groupId` | `String?` | @map("group_id") |
| `group` | `SchoolGroup?` | @relation(fields: [groupId], references: [id], onDelete: SetNull) |
| `disabledModules` | `String[]` | @default([]) @map("disabled_modules") // sidebar-config.ts module names turned OFF for this school; absent = enabled |
| `maxStudents` | `Int?` | @map("max_students") // null = uncapped |
| `maxStaff` | `Int?` | @map("max_staff") // null = uncapped |
| `loginBlocked` | `Boolean` | @default(false) @map("login_blocked") |
| `admissionNoPrefix` | `String?` | @map("admission_no_prefix") // used only to suggest the next admission number in the New Student form — admissionNo itself stays a free-text, manually-editable field exactly as before |
| `attendanceDefaulterThresholdPct` | `Int?` | @map("attendance_defaulter_threshold_pct") // a student below this overall attendance % is flagged a defaulter; null = feature not configured |
| `consecutiveAbsenceAlertDays` | `Int?` | @map("consecutive_absence_alert_days") // flag a student after this many consecutive ABSENT days; null = not configured |
| `resultsLockUntilFeesCleared` | `Boolean` | @default(false) @map("results_lock_until_fees_cleared") // when true, a parent with outstanding fees sees a "clear dues to view" notice instead of marks, even after resultReleaseAt has passed |
| `homeworkGraceDays` | `Int?` | @map("homework_grace_days") // a submission after the due date is only *displayed* as late once this many days have passed — purely a display computation, the stored SubmissionStatus (still manually cycled by the teacher) is untouched |
| `feeLateFinePerDay` | `Decimal?` | @map("fee_late_fine_per_day") @db.Decimal(10, 2) // flat fine added per day overdue, computed at display/payment time — never rewrites FeeStructure.amount |
| `feeLateFineGraceDays` | `Int?` | @map("fee_late_fine_grace_days") // days past due before the fine starts accruing |
| `gstNumber` | `String?` | @map("gst_number") |
| `gstRatePercent` | `Decimal?` | @map("gst_rate_percent") @db.Decimal(5, 2) |
| `accountsApprovalThreshold` | `Decimal?` | @map("accounts_approval_threshold") @db.Decimal(12, 2) // a manual transaction at or above this amount needs a second admin's approval before posting; null = feature not configured |
| `pfPercent` | `Decimal?` | @map("pf_percent") @db.Decimal(5, 2) |
| `esiPercent` | `Decimal?` | @map("esi_percent") @db.Decimal(5, 2) |
| `ptFixedAmount` | `Decimal?` | @map("pt_fixed_amount") @db.Decimal(10, 2) // Professional Tax is normally a state-defined slab, not a %; modeled here as one flat per-month amount |
| `tdsPercent` | `Decimal?` | @map("tds_percent") @db.Decimal(5, 2) |
| `libraryFineRatePerDay` | `Decimal?` | @map("library_fine_rate_per_day") @db.Decimal(10, 2) // flat fine per day overdue, computed at return time and posted to AccountsTransaction — see requireFeature("library.barcodesAndFines") |
| `libraryFineGraceDays` | `Int?` | @map("library_fine_grace_days") // days past due before the fine starts accruing |
| `udiseCode` | `String?` | @map("udise_code") // UDISE+ school code (Govt. of India's Unified District Information System for Education) |
| `affiliationBoard` | `String?` | @map("affiliation_board") // the school's overall affiliation, e.g. "CBSE" — distinct from Class.board, which lets individual sections mix curricula |
| `affiliationNumber` | `String?` | @map("affiliation_number") |
| `contactPerson` | `SchoolContact?` |  |
| `users` | `User[]` |  |
| `invoices` | `SubscriptionInvoice[]` |  |
| `staffProfiles` | `StaffProfile[]` |  |
| `parents` | `Parent[]` |  |
| `studentParentLinks` | `StudentParentLink[]` |  |
| `academicYears` | `AcademicYear[]` |  |
| `terms` | `Term[]` |  |
| `academicGrades` | `AcademicGrade[]` |  |
| `enrollments` | `Enrollment[]` |  |
| `classes` | `Class[]` |  |
| `subjects` | `Subject[]` |  |
| `classSubjectTeachers` | `ClassSubjectTeacher[]` |  |
| `students` | `Student[]` |  |
| `attendance` | `Attendance[]` |  |
| `staffAttendance` | `StaffAttendance[]` |  |
| `exams` | `Exam[]` |  |
| `examSubjects` | `ExamSubject[]` |  |
| `marks` | `Mark[]` |  |
| `assessmentComponents` | `AssessmentComponent[]` |  |
| `examSchedules` | `ExamSchedule[]` |  |
| `studentResults` | `StudentResult[]` |  |
| `homework` | `Homework[]` |  |
| `homeworkSubmissions` | `HomeworkSubmission[]` |  |
| `timetableSlots` | `TimetableSlot[]` |  |
| `feeStructures` | `FeeStructure[]` |  |
| `classFeeDefaults` | `ClassFeeDefault[]` |  |
| `feePayments` | `FeePayment[]` |  |
| `payrollRuns` | `PayrollRun[]` |  |
| `transportRoutes` | `TransportRoute[]` |  |
| `transportStops` | `TransportStop[]` |  |
| `transportAssignments` | `StudentTransportAssignment[]` |  |
| `transportVehicles` | `TransportVehicle[]` |  |
| `vehicleLogs` | `VehicleLog[]` |  |
| `transportAttendance` | `TransportAttendance[]` |  |
| `hostelRooms` | `HostelRoom[]` |  |
| `hostelAllocations` | `HostelAllocation[]` |  |
| `libraryBooks` | `LibraryBook[]` |  |
| `libraryCirculations` | `LibraryCirculation[]` |  |
| `events` | `Event[]` |  |
| `eventChecklistItems` | `EventChecklistItem[]` |  |
| `certificateTemplates` | `CertificateTemplate[]` |  |
| `certificatesIssued` | `CertificateIssued[]` |  |
| `announcements` | `Announcement[]` |  |
| `announcementReads` | `AnnouncementRead[]` |  |
| `accountsTransactions` | `AccountsTransaction[]` |  |
| `admissionEnquiries` | `AdmissionEnquiry[]` |  |
| `staffPermissions` | `StaffPermission[]` |  |
| `websiteSettings` | `WebsiteSettings?` |  |
| `websiteElements` | `WebsiteElement[]` |  |
| `idCardTemplates` | `IdCardTemplate[]` |  |
| `screenCustomizations` | `ScreenCustomization[]` |  |
| `notes` | `SchoolNote[]` |  |
| `activityLogs` | `ActivityLog[]` |  |
| `contracts` | `Contract[]` |  |
| `documents` | `SchoolDocument[]` |  |
| `mutationAuditLogs` | `MutationAuditLog[]` |  |
| `convertedFromLead` | `SalesLead?` |  |
| `salesActivities` | `SalesActivity[]` |  |
| `gradeScales` | `GradeScale[]` |  |
| `gradeBands` | `GradeBand[]` |  |
| `featureFlags` | `SchoolFeatureFlag[]` |  |
| `studentEmergencyContacts` | `StudentEmergencyContact[]` |  |
| `personDocuments` | `PersonDocument[]` |  |
| `classCoTeachers` | `ClassCoTeacher[]` |  |
| `rooms` | `Room[]` |  |
| `studentLeaveRequests` | `StudentLeaveRequest[]` |  |
| `examSeatings` | `ExamSeating[]` |  |
| `feeDiscounts` | `FeeDiscount[]` |  |
| `feeAdjustments` | `FeeAdjustment[]` |  |
| `dashboardReminders` | `DashboardReminder[]` |  |
| `dashboardNotes` | `DashboardNote[]` |  |
| `schoolAccountHeads` | `SchoolAccountHead[]` |  |
| `salaryComponents` | `SalaryComponent[]` |  |
| `staffLeaveTypes` | `StaffLeaveType[]` |  |
| `staffLeaveRequests` | `StaffLeaveRequest[]` |  |
| `inventoryAssets` | `InventoryAsset[]` |  |
| `inventoryConsumables` | `InventoryConsumable[]` |  |
| `inventoryStockMovements` | `InventoryStockMovement[]` |  |
| `inventoryStockItems` | `InventoryStockItem[]` |  |
| `inventoryStockItemMovements` | `InventoryStockItemMovement[]` |  |
| `inventorySales` | `InventorySale[]` |  |
| `inventorySaleItems` | `InventorySaleItem[]` |  |
| `schoolVendors` | `SchoolVendor[]` |  |
| `purchaseOrders` | `PurchaseOrder[]` |  |
| `hostelMessMenus` | `HostelMessMenu[]` |  |
| `hostelVisitorLogs` | `HostelVisitorLog[]` |  |
| `hostelOutingRequests` | `HostelOutingRequest[]` |  |
| `hostelFacilities` | `HostelFacility[]` |  |
| `hostelMealsServed` | `HostelMealServed[]` |  |
| `hostelMaintenanceLogs` | `HostelMaintenanceLog[]` |  |
| `hostelBeds` | `HostelBed[]` |  |
| `hostelAttendance` | `HostelAttendance[]` |  |
| `laundryTickets` | `LaundryTicket[]` |  |
| `laundryItems` | `LaundryItem[]` |  |
| `complianceDocuments` | `SchoolComplianceDocument[]` |  |

### `SchoolGroup`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `name` | `String` |  |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `schools` | `School[]` |  |

### `SchoolNote`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `authorId` | `String` | @map("author_id") |
| `author` | `User` | @relation(fields: [authorId], references: [id]) |
| `body` | `String` | @db.Text |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

### `SchoolContact`

| Field | Type | Attributes |
|---|---|---|
| `schoolId` | `String` | @id @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `phone` | `String` |  |
| `alternatePhone` | `String?` | @map("alternate_phone") |
| `email` | `String?` |  |
| `addressLine` | `String?` | @map("address_line") |
| `mandal` | `String?` |  |
| `district` | `String?` |  |
| `state` | `String?` |  |
| `country` | `String?` | @default("India") |
| `postalCode` | `String?` | @map("postal_code") |
| `aadharNumber` | `String?` | @map("aadhar_number") // stored in full, masked in the UI (XXXX-XXXX-1234) with a reveal toggle |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |

### `ActivityLog`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String?` | @map("school_id") |
| `school` | `School?` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `userId` | `String` | @map("user_id") |
| `user` | `User` | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| `type` | `ActivityType` |  |
| `module` | `String?` | // set for PAGE_VIEW only, e.g. "Attendance", "Fees" |
| `occurredAt` | `DateTime` | @default(now()) @map("occurred_at") |

### `MutationAuditLog`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String?` | @map("school_id") // null reserved for a future Super Admin / platform-level write path — nothing populates it yet |
| `school` | `School?` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `actorUserId` | `String?` | @map("actor_user_id") |
| `actor` | `User?` | @relation(fields: [actorUserId], references: [id]) |
| `action` | `MutationAction` |  |
| `entityType` | `String` | @map("entity_type") // Prisma model name, e.g. "Mark", "FeePayment" |
| `entityId` | `String` | @map("entity_id") |
| `changes` | `Json?` | // { field: { before, after } } on UPDATE; { deleted: {...} } on DELETE; omitted on CREATE |
| `occurredAt` | `DateTime` | @default(now()) @map("occurred_at") |

### `SubscriptionPlan`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `name` | `String` | @unique |
| `billingCycle` | `BillingCycle` | @map("billing_cycle") |
| `price` | `Decimal` | @db.Decimal(10, 2) |
| `currency` | `String` | @default("INR") |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `invoices` | `SubscriptionInvoice[]` |  |

### `SubscriptionInvoice`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `planId` | `String?` | @map("plan_id") // nullable so invoices created before this existed stay valid |
| `plan` | `SubscriptionPlan?` | @relation(fields: [planId], references: [id]) |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `billingPeriod` | `String` | @map("billing_period") // e.g. "2026-27" |
| `dueDate` | `DateTime` | @map("due_date") |
| `status` | `InvoiceStatus` | @default(PENDING) |
| `recurrence` | `Recurrence` | @default(NONE) // schedules "generate next invoice" in the Accounts module |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `payments` | `SubscriptionPayment[]` |  |

### `SubscriptionPayment`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `invoiceId` | `String` | @map("invoice_id") |
| `invoice` | `SubscriptionInvoice` | @relation(fields: [invoiceId], references: [id], onDelete: Cascade) |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `method` | `String` | // bank transfer / UPI / cheque |
| `referenceNo` | `String?` | @map("reference_no") |
| `paidOn` | `DateTime` | @map("paid_on") |
| `ledgerEntry` | `LedgerEntry?` |  |

## Sales Pipeline

**`LeadSource`** (enum): `REFERRAL`, `WEBSITE`, `COLD_OUTREACH`, `EVENT`, `OTHER`

**`LeadStage`** (enum): `NEW`, `CONTACTED`, `DEMO_SCHEDULED`, `DEMO_DONE`, `PROPOSAL_SENT`, `NEGOTIATION`, `WON`, `LOST`

**`SalesActivityType`** (enum): `CALL`, `MEETING`, `EMAIL`, `TASK`

### `SalesLead`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolNameProposed` | `String` | @map("school_name_proposed") |
| `contactName` | `String` | @map("contact_name") |
| `contactPhone` | `String` | @map("contact_phone") |
| `contactEmail` | `String?` | @map("contact_email") |
| `addressLine` | `String?` | @map("address_line") |
| `mandal` | `String?` |  |
| `district` | `String?` |  |
| `state` | `String?` |  |
| `country` | `String?` | @default("India") |
| `postalCode` | `String?` | @map("postal_code") |
| `source` | `LeadSource` |  |
| `stage` | `LeadStage` | @default(NEW) |
| `estimatedValue` | `Decimal?` | @map("estimated_value") @db.Decimal(10, 2) |
| `expectedCloseDate` | `DateTime?` | @map("expected_close_date") |
| `relationshipManager` | `String?` | @map("relationship_manager") // free-text, matches School.relationshipManager convention |
| `lostReason` | `String?` | @map("lost_reason") // set when stage -> LOST |
| `convertedSchoolId` | `String?` | @unique @map("converted_school_id") |
| `convertedSchool` | `School?` | @relation(fields: [convertedSchoolId], references: [id]) |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |
| `activities` | `SalesActivity[]` |  |

### `SalesActivity`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `leadId` | `String?` | @map("lead_id") |
| `lead` | `SalesLead?` | @relation(fields: [leadId], references: [id], onDelete: Cascade) |
| `schoolId` | `String?` | @map("school_id") |
| `school` | `School?` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `type` | `SalesActivityType` |  |
| `notes` | `String` | @db.Text |
| `dueAt` | `DateTime?` | @map("due_at") |
| `completedAt` | `DateTime?` | @map("completed_at") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

## Contracts

**`ContractStatus`** (enum): `DRAFT`, `SENT`, `SIGNED`, `CANCELLED`

### `Contract`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `contractNumber` | `String` | @unique @map("contract_number") |
| `billingCycle` | `Recurrence` | @default(YEARLY) @map("billing_cycle") |
| `annualFee` | `Decimal` | @map("annual_fee") @db.Decimal(12, 2) |
| `startDate` | `DateTime` | @map("start_date") |
| `endDate` | `DateTime` | @map("end_date") |
| `termsBody` | `String` | @map("terms_body") @db.Text |
| `status` | `ContractStatus` | @default(DRAFT) |
| `signatoryName` | `String?` | @map("signatory_name") // person signing on the school's behalf |
| `signatoryTitle` | `String?` | @map("signatory_title") |
| `signedDate` | `DateTime?` | @map("signed_date") |
| `createdByUserId` | `String?` | @map("created_by_user_id") |
| `createdBy` | `User?` | @relation(fields: [createdByUserId], references: [id]) |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |

## School Documents

**`SchoolDocumentCategory`** (enum): `CONTRACT`, `REGISTRATION`, `ID_PROOF`, `OTHER`

### `SchoolDocument`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `category` | `SchoolDocumentCategory` | @default(OTHER) |
| `fileName` | `String` | @map("file_name") |
| `mimeType` | `String` | @map("mime_type") |
| `sizeBytes` | `Int` | @map("size_bytes") |
| `storagePath` | `String` | @map("storage_path") |
| `uploadedById` | `String?` | @map("uploaded_by_id") |
| `uploadedBy` | `User?` | @relation(fields: [uploadedById], references: [id]) |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

### `SchoolComplianceDocument`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `documentType` | `String` | @map("document_type") // e.g. "Affiliation Certificate", "Recognition Certificate", "Fire Safety NOC" |
| `documentNo` | `String?` | @map("document_no") |
| `issuedDate` | `DateTime?` | @map("issued_date") |
| `expiryDate` | `DateTime?` | @map("expiry_date") |
| `filePath` | `String?` | @map("file_path") |
| `notes` | `String?` | @db.Text |

## Platform Accounting

**`LedgerAccountType`** (enum): `INCOME`, `EXPENSE`, `ASSET`, `LIABILITY`

**`Recurrence`** (enum): `NONE`, `MONTHLY`, `QUARTERLY`, `YEARLY`

**`BillStatus`** (enum): `PENDING`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `CANCELLED`

**`LedgerEntryType`** (enum): `INCOME`, `EXPENSE`

**`LedgerSource`** (enum): `MANUAL`, `AUTO_SUBSCRIPTION`

### `LedgerAccount`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `name` | `String` | @unique |
| `type` | `LedgerAccountType` |  |
| `code` | `String?` |  |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `bills` | `Bill[]` |  |
| `entries` | `LedgerEntry[]` |  |

### `Vendor`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `name` | `String` |  |
| `category` | `String?` |  |
| `contactName` | `String?` | @map("contact_name") |
| `phone` | `String?` |  |
| `email` | `String?` |  |
| `notes` | `String?` | @db.Text |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `bills` | `Bill[]` |  |
| `entries` | `LedgerEntry[]` |  |

### `Bill`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `billNumber` | `String` | @unique @map("bill_number") |
| `vendorId` | `String` | @map("vendor_id") |
| `vendor` | `Vendor` | @relation(fields: [vendorId], references: [id]) |
| `ledgerAccountId` | `String` | @map("ledger_account_id") |
| `ledgerAccount` | `LedgerAccount` | @relation(fields: [ledgerAccountId], references: [id]) |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `issueDate` | `DateTime` | @map("issue_date") |
| `dueDate` | `DateTime` | @map("due_date") |
| `status` | `BillStatus` | @default(PENDING) |
| `recurrence` | `Recurrence` | @default(NONE) |
| `notes` | `String?` | @db.Text |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `payments` | `LedgerEntry[]` |  |

### `LedgerEntry`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `entryType` | `LedgerEntryType` | @map("entry_type") |
| `ledgerAccountId` | `String` | @map("ledger_account_id") |
| `ledgerAccount` | `LedgerAccount` | @relation(fields: [ledgerAccountId], references: [id]) |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `date` | `DateTime` |  |
| `description` | `String` |  |
| `method` | `String?` |  |
| `referenceNo` | `String?` | @map("reference_no") |
| `source` | `LedgerSource` | @default(MANUAL) |
| `vendorId` | `String?` | @map("vendor_id") |
| `vendor` | `Vendor?` | @relation(fields: [vendorId], references: [id]) |
| `billId` | `String?` | @map("bill_id") |
| `bill` | `Bill?` | @relation(fields: [billId], references: [id]) |
| `subscriptionPaymentId` | `String?` | @unique @map("subscription_payment_id") |
| `subscriptionPayment` | `SubscriptionPayment?` | @relation(fields: [subscriptionPaymentId], references: [id]) |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

## People & Access

**`UserRole`** (enum): `SUPER_ADMIN`, `PLATFORM_STAFF`, `SCHOOL_ADMIN`, `STAFF`, `PARENT`

**`UserStatus`** (enum): `ACTIVE`, `INACTIVE`

**`EmploymentStatus`** (enum): `ACTIVE`, `ON_LEAVE`

**`StaffCategory`** (enum): `TEACHING`, `NON_TEACHING`

**`AccessLevel`** (enum): `NONE`, `VIEW`, `EDIT`

**`ParentRelation`** (enum): `FATHER`, `MOTHER`, `GUARDIAN`

### `User`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String?` | @map("school_id") // null for Super Admin accounts |
| `school` | `School?` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `phone` | `String?` |  |
| `username` | `String` | @unique |
| `email` | `String?` | @unique |
| `passwordHash` | `String` | @map("password_hash") |
| `role` | `UserRole` |  |
| `status` | `UserStatus` | @default(ACTIVE) |
| `mustChangePassword` | `Boolean` | @default(true) @map("must_change_password") |
| `setupTokenHash` | `String?` | @unique @map("setup_token_hash") |
| `setupTokenExpiresAt` | `DateTime?` | @map("setup_token_expires_at") |
| `lastLoginAt` | `DateTime?` | @map("last_login_at") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |
| `staffProfile` | `StaffProfile?` |  |
| `platformStaffProfile` | `PlatformStaffProfile?` |  |
| `parentProfile` | `Parent?` |  |
| `announcementReads` | `AnnouncementRead[]` |  |
| `schoolNotesAuthored` | `SchoolNote[]` |  |
| `activityLogs` | `ActivityLog[]` |  |
| `contractsCreated` | `Contract[]` |  |
| `documentsUploaded` | `SchoolDocument[]` |  |
| `mutationAuditLogs` | `MutationAuditLog[]` |  |

### `StaffProfile`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `userId` | `String` | @unique @map("user_id") |
| `user` | `User` | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| `designation` | `String?` | // e.g. "Class Teacher — 6B" |
| `department` | `String?` | // e.g. "Accounts" |
| `staffCategory` | `StaffCategory` | @default(TEACHING) @map("staff_category") // drives the Teaching/Non-teaching attendance split on the Dashboard |
| `dateJoined` | `DateTime?` | @map("date_joined") |
| `employmentStatus` | `EmploymentStatus` | @default(ACTIVE) @map("employment_status") |
| `photoPath` | `String?` | @map("photo_path") // set from the ID Card Templates preview screen — no dedicated upload UI elsewhere yet |
| `qualifications` | `String?` | @db.Text |
| `specialization` | `String?` | // e.g. "Mathematics, Grades 6-10" |
| `shiftStart` | `String?` | @map("shift_start") // "HH:MM", 24h — a plain string rather than @db.Time since it's just compared against StaffAttendance.checkInTime for a late-arrival flag, no date arithmetic needed |
| `employeeId` | `String?` | @map("employee_id") // a school-facing code, distinct from the internal id — suggested at creation, editable |
| `dob` | `DateTime?` |  |
| `gender` | `Gender?` |  |
| `bloodGroup` | `String?` | @map("blood_group") |
| `maritalStatus` | `String?` | @map("marital_status") |
| `nationality` | `String?` |  |
| `aadhaarNumber` | `String?` | @map("aadhaar_number") |
| `panNumber` | `String?` | @map("pan_number") |
| `mobilePrimary` | `String?` | @map("mobile_primary") |
| `mobileAlternate` | `String?` | @map("mobile_alternate") |
| `personalEmail` | `String?` | @map("personal_email") |
| `currentAddress` | `String?` | @map("current_address") @db.Text |
| `permanentAddress` | `String?` | @map("permanent_address") @db.Text |
| `emergencyContactName` | `String?` | @map("emergency_contact_name") |
| `emergencyContactPhone` | `String?` | @map("emergency_contact_phone") |
| `employmentType` | `String?` | @map("employment_type") // Full-time / Part-time / Contract |
| `workLocation` | `String?` | @map("work_location") |
| `reportingManagerId` | `String?` | @map("reporting_manager_id") |
| `reportingManager` | `StaffProfile?` | @relation("ReportingManager", fields: [reportingManagerId], references: [id], onDelete: SetNull) |
| `directReports` | `StaffProfile[]` | @relation("ReportingManager") |
| `driversLicenseNo` | `String?` | @map("drivers_license_no") // non-teaching (e.g. drivers) |
| `teachingCertification` | `String?` | @map("teaching_certification") // e.g. B.Ed — teaching staff |
| `yearsOfExperience` | `Int?` | @map("years_of_experience") |
| `previousEmployerName` | `String?` | @map("previous_employer_name") |
| `previousDesignation` | `String?` | @map("previous_designation") |
| `salaryPayGrade` | `String?` | @map("salary_pay_grade") |
| `bankAccountNumber` | `String?` | @map("bank_account_number") |
| `ifscCode` | `String?` | @map("ifsc_code") |
| `bankName` | `String?` | @map("bank_name") |
| `pfNumber` | `String?` | @map("pf_number") |
| `uanNumber` | `String?` | @map("uan_number") |
| `esiNumber` | `String?` | @map("esi_number") |
| `permissions` | `StaffPermission[]` |  |
| `classesAsTeacher` | `Class[]` | @relation("ClassTeacher") |
| `timetableSlots` | `TimetableSlot[]` |  |
| `payrollRuns` | `PayrollRun[]` |  |
| `attendanceMarked` | `Attendance[]` | @relation("AttendanceMarkedBy") |
| `staffAttendance` | `StaffAttendance[]` |  |
| `homeworkAssigned` | `Homework[]` |  |
| `certificatesIssued` | `CertificateIssued[]` |  |
| `subjectAssignments` | `ClassSubjectTeacher[]` |  |
| `documents` | `PersonDocument[]` |  |
| `coTeacherOf` | `ClassCoTeacher[]` |  |
| `salaryComponents` | `SalaryComponent[]` |  |
| `leaveRequests` | `StaffLeaveRequest[]` |  |
| `wardenOfRooms` | `HostelRoom[]` |  |
| `examInvigilations` | `ExamSchedule[]` |  |
| `hostelAttendanceMarked` | `HostelAttendance[]` |  |

### `StaffPermission`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `moduleName` | `String` | @map("module_name") // e.g. "Attendance", "Fees", "Accounts" |
| `classId` | `String?` | @map("class_id") |
| `class` | `Class?` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `accessLevel` | `AccessLevel` | @default(NONE) @map("access_level") |

### `PlatformStaffProfile`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `userId` | `String` | @unique @map("user_id") |
| `user` | `User` | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| `title` | `String?` | // e.g. "Onboarding Manager", "Accounts Executive" |
| `department` | `String?` | // e.g. "Sales", "Support", "Finance" |
| `dateJoined` | `DateTime?` | @map("date_joined") |
| `employmentStatus` | `EmploymentStatus` | @default(ACTIVE) @map("employment_status") |
| `permissions` | `PlatformStaffPermission[]` |  |

### `PlatformStaffPermission`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `PlatformStaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `moduleName` | `String` | @map("module_name") // e.g. "Schools", "Accounts", "Contracts" |
| `accessLevel` | `AccessLevel` | @default(NONE) @map("access_level") |

### `Parent`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `userId` | `String` | @unique @map("user_id") |
| `user` | `User` | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `phone` | `String?` |  |
| `email` | `String?` |  |
| `preferredContactMethod` | `String?` | @map("preferred_contact_method") // e.g. "Phone call", "WhatsApp", "Email" — a stored preference for the office to use manually; no channel here is actually automated |
| `studentLinks` | `StudentParentLink[]` |  |

### `StudentParentLink`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `parentId` | `String` | @map("parent_id") |
| `parent` | `Parent` | @relation(fields: [parentId], references: [id], onDelete: Cascade) |
| `relation` | `ParentRelation` |  |
| `isPrimary` | `Boolean` | @default(false) @map("is_primary") // the guardian contacted first — at most one per student, enforced in code (upsert-style toggle), not a DB constraint, same pattern as StaffPermission's "at most one school-wide row" |

## Academics

**`StudentStatus`** (enum): `ACTIVE`, `ALUMNI`

**`Gender`** (enum): `MALE`, `FEMALE`, `OTHER`

**`EnrollmentStatus`** (enum): `ACTIVE`, `COMPLETED`, `PROMOTED`, `TRANSFERRED`, `WITHDRAWN`

**`DocumentSubjectType`** (enum): `STUDENT`, `STAFF`, `VEHICLE`

**`AttendanceStatus`** (enum): `PRESENT`, `ABSENT`, `HALF_DAY`

**`LeaveRequestStage`** (enum): `PENDING`, `CLASS_TEACHER_APPROVED`, `ADMIN_APPROVED`, `REJECTED`

**`StaffLeaveRequestStatus`** (enum): `PENDING`, `APPROVED`, `REJECTED`

**`ExamApprovalStatus`** (enum): `PENDING`, `APPROVED`, `REJECTED`

**`SubmissionStatus`** (enum): `PENDING`, `SUBMITTED`, `LATE`

**`DayOfWeek`** (enum): `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`

### `AcademicYear`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `label` | `String` | // e.g. "2026–27" |
| `startDate` | `DateTime` | @map("start_date") |
| `endDate` | `DateTime` | @map("end_date") |
| `isCurrent` | `Boolean` | @default(false) @map("is_current") |
| `gradeScaleId` | `String?` | @map("grade_scale_id") // nullable — schools without one configured fall back to lib/academic.ts's hardcoded gradeFor() |
| `gradeScale` | `GradeScale?` | @relation(fields: [gradeScaleId], references: [id]) |
| `classes` | `Class[]` |  |
| `exams` | `Exam[]` |  |
| `feeStructures` | `FeeStructure[]` |  |
| `classFeeDefaults` | `ClassFeeDefault[]` |  |
| `terms` | `Term[]` |  |
| `academicGrades` | `AcademicGrade[]` |  |
| `enrollments` | `Enrollment[]` |  |

### `Term`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Term 1" |
| `startDate` | `DateTime` | @map("start_date") |
| `endDate` | `DateTime` | @map("end_date") |
| `isCurrent` | `Boolean` | @default(false) @map("is_current") |

### `GradeScale`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "CBSE 10-point" |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `bands` | `GradeBand[]` |  |
| `academicYears` | `AcademicYear[]` |  |

### `GradeBand`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `scaleId` | `String` | @map("scale_id") |
| `scale` | `GradeScale` | @relation(fields: [scaleId], references: [id], onDelete: Cascade) |
| `label` | `String` | // e.g. "A1" |
| `minPercent` | `Decimal` | @map("min_percent") @db.Decimal(5, 2) |
| `maxPercent` | `Decimal` | @map("max_percent") @db.Decimal(5, 2) |
| `remark` | `String?` | // e.g. "Outstanding" |

### `AcademicGrade`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "6" — matches Class.grade for the same year |
| `sequence` | `Int?` | // optional ordering hint (1 for Grade 1, 11 for Grade 11) for sorting beyond string comparison |
| `classes` | `Class[]` |  |

### `Class`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `grade` | `String` | // e.g. "6" |
| `academicGradeId` | `String?` | @map("academic_grade_id") |
| `academicGrade` | `AcademicGrade?` | @relation(fields: [academicGradeId], references: [id], onDelete: SetNull) |
| `section` | `String` | // e.g. "B" |
| `classTeacherStaffId` | `String?` | @map("class_teacher_staff_id") |
| `classTeacher` | `StaffProfile?` | @relation("ClassTeacher", fields: [classTeacherStaffId], references: [id]) |
| `maxStrength` | `Int?` | @map("max_strength") // null = no configured cap, no breach warning shown |
| `board` | `String?` | // curriculum/board this class follows, e.g. "CBSE", "ICSE", "State Board" — schools can mix boards across grades |
| `rteQuotaSeats` | `Int?` | @map("rte_quota_seats") // RTE Act 25% reservation seats configured for this section — see requireFeature("compliance.udise") |
| `students` | `Student[]` |  |
| `exams` | `Exam[]` |  |
| `homework` | `Homework[]` |  |
| `timetableSlots` | `TimetableSlot[]` |  |
| `feeStructures` | `FeeStructure[]` |  |
| `staffPermissions` | `StaffPermission[]` |  |
| `subjectTeachers` | `ClassSubjectTeacher[]` |  |
| `coTeachers` | `ClassCoTeacher[]` |  |
| `enrollments` | `Enrollment[]` |  |
| `attendance` | `Attendance[]` |  |

### `ClassCoTeacher`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |

### `Subject`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Mathematics" |
| `isElective` | `Boolean` | @default(false) @map("is_elective") |
| `credits` | `Int?` | // credit/weightage value, school-defined units |
| `examSubjects` | `ExamSubject[]` |  |
| `homework` | `Homework[]` |  |
| `timetableSlots` | `TimetableSlot[]` |  |
| `classAssignments` | `ClassSubjectTeacher[]` |  |

### `ClassSubjectTeacher`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `subjectId` | `String` | @map("subject_id") |
| `subject` | `Subject` | @relation(fields: [subjectId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id]) |

### `Student`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `admissionNo` | `String` | @map("admission_no") |
| `firstName` | `String` | @map("first_name") |
| `surname` | `String` |  |
| `dob` | `DateTime?` |  |
| `gender` | `Gender?` |  |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id]) |
| `status` | `StudentStatus` | @default(ACTIVE) |
| `photoPath` | `String?` | @map("photo_path") // set from the ID Card Templates preview screen — no dedicated upload UI elsewhere yet |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `chargedFee` | `Decimal?` | @map("charged_fee") @db.Decimal(12, 2) |
| `address` | `String?` | @db.Text |
| `bloodGroup` | `String?` | @map("blood_group") // e.g. "O+" |
| `medicalNotes` | `String?` | @map("medical_notes") @db.Text // allergies/conditions, free text |
| `previousSchoolName` | `String?` | @map("previous_school_name") |
| `previousTcNo` | `String?` | @map("previous_tc_no") |
| `previousTcDate` | `DateTime?` | @map("previous_tc_date") |
| `priorPerformanceNote` | `String?` | @map("prior_performance_note") @db.Text |
| `parentLinks` | `StudentParentLink[]` |  |
| `attendance` | `Attendance[]` |  |
| `marks` | `Mark[]` |  |
| `homeworkSubmissions` | `HomeworkSubmission[]` |  |
| `feePayments` | `FeePayment[]` |  |
| `transportAssignment` | `StudentTransportAssignment?` |  |
| `transportAttendance` | `TransportAttendance[]` |  |
| `hostelAllocations` | `HostelAllocation[]` |  |
| `libraryCirculations` | `LibraryCirculation[]` |  |
| `certificatesIssued` | `CertificateIssued[]` |  |
| `admissionEnquiry` | `AdmissionEnquiry?` |  |
| `emergencyContacts` | `StudentEmergencyContact[]` |  |
| `documents` | `PersonDocument[]` |  |
| `leaveRequests` | `StudentLeaveRequest[]` |  |
| `examSeatings` | `ExamSeating[]` |  |
| `feeDiscounts` | `FeeDiscount[]` |  |
| `feeAdjustments` | `FeeAdjustment[]` |  |
| `hostelVisitorLogs` | `HostelVisitorLog[]` |  |
| `hostelOutingRequests` | `HostelOutingRequest[]` |  |
| `hostelAttendance` | `HostelAttendance[]` |  |
| `laundryTickets` | `LaundryTicket[]` |  |
| `enrollments` | `Enrollment[]` |  |
| `examResults` | `StudentResult[]` |  |

### `Enrollment`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `academicYearId` | `String` | @map("academic_year_id") |
| `academicYear` | `AcademicYear` | @relation(fields: [academicYearId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `rollNumber` | `String?` | @map("roll_number") |
| `status` | `EnrollmentStatus` | @default(ACTIVE) |
| `enrolledOn` | `DateTime` | @default(now()) @map("enrolled_on") |
| `endedOn` | `DateTime?` | @map("ended_on") |

### `StudentEmergencyContact`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `relation` | `String` | // free text, e.g. "Uncle", "Neighbour" — deliberately not the same enum as ParentRelation, since an emergency contact need not be a guardian |
| `phone` | `String` |  |
| `priority` | `Int` | @default(1) |

### `PersonDocument`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `subjectType` | `DocumentSubjectType` | @map("subject_type") |
| `studentId` | `String?` | @map("student_id") |
| `student` | `Student?` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `staffId` | `String?` | @map("staff_id") |
| `staff` | `StaffProfile?` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `vehicleId` | `String?` | @map("vehicle_id") |
| `vehicle` | `TransportVehicle?` | @relation(fields: [vehicleId], references: [id], onDelete: Cascade) |
| `category` | `String` | // e.g. "ID Proof", "Certificate", "Medical", "Insurance Policy", "RC" |
| `label` | `String` | // the file's display name |
| `filePath` | `String` | @map("file_path") |
| `expiryDate` | `DateTime?` | @map("expiry_date") |
| `uploadedAt` | `DateTime` | @default(now()) @map("uploaded_at") |

### `Attendance`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `status` | `AttendanceStatus` |  |
| `markedByStaffId` | `String?` | @map("marked_by_staff_id") |
| `markedByStaff` | `StaffProfile?` | @relation("AttendanceMarkedBy", fields: [markedByStaffId], references: [id]) |
| `classId` | `String?` | @map("class_id") |
| `class` | `Class?` | @relation(fields: [classId], references: [id], onDelete: SetNull) |

### `StudentLeaveRequest`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `dateFrom` | `DateTime` | @map("date_from") @db.Date |
| `dateTo` | `DateTime` | @map("date_to") @db.Date |
| `reason` | `String` | @db.Text |
| `stage` | `LeaveRequestStage` | @default(PENDING) |
| `requestedAt` | `DateTime` | @default(now()) @map("requested_at") |
| `classTeacherActionAt` | `DateTime?` | @map("class_teacher_action_at") |
| `adminActionAt` | `DateTime?` | @map("admin_action_at") |
| `rejectionNote` | `String?` | @map("rejection_note") |

### `StaffLeaveType`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Casual Leave", "Sick Leave", "Earned Leave" |
| `annualQuota` | `Int` | @map("annual_quota") |
| `requests` | `StaffLeaveRequest[]` |  |

### `StaffLeaveRequest`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `leaveTypeId` | `String` | @map("leave_type_id") |
| `leaveType` | `StaffLeaveType` | @relation(fields: [leaveTypeId], references: [id], onDelete: Cascade) |
| `dateFrom` | `DateTime` | @map("date_from") @db.Date |
| `dateTo` | `DateTime` | @map("date_to") @db.Date |
| `reason` | `String` | @db.Text |
| `status` | `StaffLeaveRequestStatus` | @default(PENDING) |
| `requestedAt` | `DateTime` | @default(now()) @map("requested_at") |
| `approvedByStaffId` | `String?` | @map("approved_by_staff_id") // the approving admin's own StaffProfile, when the approver happens to have one; a School Admin login often doesn't, so this may stay null even on an approved request |
| `actionAt` | `DateTime?` | @map("action_at") |

### `StaffAttendance`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `status` | `AttendanceStatus` |  |
| `checkInTime` | `String?` | @map("check_in_time") // "HH:MM", optional — compared against StaffProfile.shiftStart for a late-arrival flag, display-only |

### `Exam`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Mid-Term", "Unit Test 1" |
| `startDate` | `DateTime` | @map("start_date") |
| `endDate` | `DateTime` | @map("end_date") |
| `resultReleaseAt` | `DateTime?` | @map("result_release_at") // parents can't see this exam's marks before this instant — null = visible as soon as entered (today's behavior) |
| `approvalStatus` | `ExamApprovalStatus` | @default(APPROVED) @map("approval_status") |
| `examSubjects` | `ExamSubject[]` |  |
| `seating` | `ExamSeating[]` |  |
| `results` | `StudentResult[]` |  |

### `AssessmentComponent`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examSubjectId` | `String` | @map("exam_subject_id") |
| `examSubject` | `ExamSubject` | @relation(fields: [examSubjectId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Written", "Internal", "Assignment" |
| `maxMarks` | `Decimal` | @map("max_marks") @db.Decimal(6, 2) |
| `passMarks` | `Decimal?` | @map("pass_marks") @db.Decimal(6, 2) |
| `weightagePercent` | `Decimal` | @map("weightage_percent") @db.Decimal(5, 2) |

### `ExamSchedule`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examSubjectId` | `String` | @unique @map("exam_subject_id") |
| `examSubject` | `ExamSubject` | @relation(fields: [examSubjectId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `startTime` | `String` | @map("start_time") // "HH:MM" |
| `endTime` | `String` | @map("end_time") // "HH:MM" |
| `roomId` | `String?` | @map("room_id") |
| `room` | `Room?` | @relation(fields: [roomId], references: [id], onDelete: SetNull) |
| `invigilatorId` | `String?` | @map("invigilator_id") |
| `invigilator` | `StaffProfile?` | @relation(fields: [invigilatorId], references: [id], onDelete: SetNull) |

### `StudentResult`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examId` | `String` | @map("exam_id") |
| `exam` | `Exam` | @relation(fields: [examId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `totalMarks` | `Decimal` | @map("total_marks") @db.Decimal(8, 2) |
| `maxMarks` | `Decimal` | @map("max_marks") @db.Decimal(8, 2) |
| `percentage` | `Decimal` | @db.Decimal(5, 2) |
| `grade` | `String?` |  |
| `rank` | `Int?` |  |
| `computedAt` | `DateTime` | @default(now()) @map("computed_at") |

### `ExamSubject`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examId` | `String` | @map("exam_id") |
| `exam` | `Exam` | @relation(fields: [examId], references: [id], onDelete: Cascade) |
| `subjectId` | `String` | @map("subject_id") |
| `subject` | `Subject` | @relation(fields: [subjectId], references: [id], onDelete: Cascade) |
| `maxMarks` | `Int` | @map("max_marks") // e.g. 100 |
| `marks` | `Mark[]` |  |
| `assessmentComponents` | `AssessmentComponent[]` |  |
| `schedule` | `ExamSchedule?` |  |

### `Mark`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examSubjectId` | `String` | @map("exam_subject_id") |
| `examSubject` | `ExamSubject` | @relation(fields: [examSubjectId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `marksObtained` | `Decimal` | @map("marks_obtained") @db.Decimal(6, 2) |

### `Homework`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `subjectId` | `String` | @map("subject_id") |
| `subject` | `Subject` | @relation(fields: [subjectId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id]) |
| `title` | `String` |  |
| `description` | `String?` |  |
| `dueDate` | `DateTime` | @map("due_date") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `attachmentPath` | `String?` | @map("attachment_path") // the assignment's own file, set by the teacher |
| `submissions` | `HomeworkSubmission[]` |  |

### `HomeworkSubmission`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `assignmentId` | `String` | @map("assignment_id") |
| `assignment` | `Homework` | @relation(fields: [assignmentId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `status` | `SubmissionStatus` | @default(PENDING) |
| `submittedOn` | `DateTime?` | @map("submitted_on") |
| `score` | `Decimal?` | @db.Decimal(5, 2) // out of 10 — set once a teacher grades the submission |
| `attachmentPath` | `String?` | @map("attachment_path") // uploaded by the parent on the student's behalf — there's no student login in this app |

### `TimetableSlot`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `subjectId` | `String` | @map("subject_id") |
| `subject` | `Subject` | @relation(fields: [subjectId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id]) |
| `dayOfWeek` | `DayOfWeek` | @map("day_of_week") |
| `periodNo` | `Int` | @map("period_no") // 1–8 |
| `roomId` | `String?` | @map("room_id") // only set when the school has Room allocation enabled — see lib/feature-flags.ts "timetable.roomsAndConflicts" |
| `room` | `Room?` | @relation(fields: [roomId], references: [id]) |

### `Room`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Room 204", "Chemistry Lab" |
| `capacity` | `Int?` |  |
| `equipmentNote` | `String?` | @map("equipment_note") // free text, e.g. "Projector, 2 lab benches" |
| `timetableSlots` | `TimetableSlot[]` |  |
| `examSeats` | `ExamSeating[]` |  |
| `examSchedules` | `ExamSchedule[]` |  |

### `ExamSeating`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `examId` | `String` | @map("exam_id") |
| `exam` | `Exam` | @relation(fields: [examId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `roomId` | `String?` | @map("room_id") |
| `room` | `Room?` | @relation(fields: [roomId], references: [id]) |
| `seatNo` | `Int` | @map("seat_no") |

## Finance

**`FeePaymentStatus`** (enum): `PAID`, `PARTIAL`

**`DiscountKind`** (enum): `SCHOLARSHIP`, `SIBLING`, `OTHER`

**`DiscountValueType`** (enum): `PERCENT`, `FLAT`

**`TxnSource`** (enum): `AUTO_FEES`, `AUTO_PAYROLL`, `AUTO_LIBRARY_FINE`, `AUTO_INVENTORY_PURCHASE`, `AUTO_INVENTORY_SALE`, `MANUAL`

**`TxnType`** (enum): `INCOME`, `EXPENSE`

**`TxnApprovalStatus`** (enum): `NONE // approval flow not applicable to this row — counts immediately, exactly like every AccountsTransaction did before this enum existed`, `PENDING`, `APPROVED`, `REJECTED`

**`AccountHeadType`** (enum): `ASSET`, `LIABILITY`, `INCOME`, `EXPENSE`

**`PayrollStatus`** (enum): `PENDING`, `PAID`

### `ClassFeeDefault`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `grade` | `String` |  |
| `actualFee` | `Decimal` | @map("actual_fee") @db.Decimal(12, 2) |

### `FeeStructure`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `classId` | `String` | @map("class_id") |
| `class` | `Class` | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| `yearId` | `String` | @map("year_id") |
| `year` | `AcademicYear` | @relation(fields: [yearId], references: [id], onDelete: Cascade) |
| `term` | `String` | // e.g. "Term 2" |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `dueDate` | `DateTime` | @map("due_date") |
| `payments` | `FeePayment[]` |  |

### `FeePayment`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `feeStructureId` | `String` | @map("fee_structure_id") |
| `feeStructure` | `FeeStructure` | @relation(fields: [feeStructureId], references: [id], onDelete: Cascade) |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `method` | `String` |  |
| `referenceNo` | `String?` | @map("reference_no") |
| `paidOn` | `DateTime` | @map("paid_on") |
| `status` | `FeePaymentStatus` | @default(PAID) |

### `FeeDiscount`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `kind` | `DiscountKind` |  |
| `valueType` | `DiscountValueType` | @map("value_type") |
| `value` | `Decimal` | @db.Decimal(10, 2) // a percent (0-100) or a flat rupee amount, per valueType |
| `note` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

### `FeeAdjustment`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `description` | `String` |  |
| `amount` | `Decimal` | @db.Decimal(10, 2) |
| `addedOn` | `DateTime` | @default(now()) @map("added_on") |

### `DashboardReminder`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `title` | `String` |  |
| `content` | `String` | @db.Text |
| `remindAt` | `DateTime?` | @map("remind_at") @db.Date |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

### `DashboardNote`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `content` | `String` | @db.Text |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |

### `AccountsTransaction`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `description` | `String` |  |
| `category` | `String?` |  |
| `source` | `TxnSource` | @default(MANUAL) |
| `type` | `TxnType` |  |
| `amount` | `Decimal` | @db.Decimal(12, 2) |
| `accountHeadId` | `String?` | @map("account_head_id") // optional structured tagging on top of the free-text `category` above — category stays as-is |
| `accountHead` | `SchoolAccountHead?` | @relation(fields: [accountHeadId], references: [id]) |
| `approvalStatus` | `TxnApprovalStatus` | @default(NONE) @map("approval_status") // PENDING rows are excluded from every balance/report computation until approved — see requireFeature("accounts.approvals") |

### `SchoolAccountHead`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `type` | `AccountHeadType` |  |
| `transactions` | `AccountsTransaction[]` |  |

### `PayrollRun`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `month` | `String` | // e.g. "2026-08" |
| `amount` | `Decimal` | @db.Decimal(12, 2) // the actual paid (net) amount — unchanged meaning whether this run came from the simple flow or the structured one below |
| `status` | `PayrollStatus` | @default(PENDING) |
| `paidOn` | `DateTime?` | @map("paid_on") |
| `grossAmount` | `Decimal?` | @map("gross_amount") @db.Decimal(12, 2) |
| `pfAmount` | `Decimal?` | @map("pf_amount") @db.Decimal(12, 2) |
| `esiAmount` | `Decimal?` | @map("esi_amount") @db.Decimal(12, 2) |
| `tdsAmount` | `Decimal?` | @map("tds_amount") @db.Decimal(12, 2) |
| `ptAmount` | `Decimal?` | @map("pt_amount") @db.Decimal(12, 2) |
| `lopAmount` | `Decimal?` | @map("lop_amount") @db.Decimal(12, 2) // loss-of-pay deduction — populated once Batch 11's staff leave balances exist to compute it from |

### `SalaryComponent`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `staffId` | `String` | @map("staff_id") |
| `staff` | `StaffProfile` | @relation(fields: [staffId], references: [id], onDelete: Cascade) |
| `name` | `String` | // e.g. "Basic", "HRA", "Conveyance Allowance" |
| `amount` | `Decimal` | @db.Decimal(12, 2) |

## Admissions

**`AdmissionStage`** (enum): `ENQUIRY`, `APPLICATION`, `ADMITTED`

**`AdmissionApprovalStatus`** (enum): `NONE`, `PENDING`, `APPROVED`, `REJECTED`

### `AdmissionEnquiry`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `applicantName` | `String` | @map("applicant_name") |
| `parentContact` | `String` | @map("parent_contact") // "Contact number 1" — the one field the light-weight Enquiry stage always has |
| `classApplied` | `String` | @map("class_applied") // free text at Enquiry stage — a real Class is only picked at approval time (see admittedClassId) |
| `stage` | `AdmissionStage` | @default(ENQUIRY) |
| `convertedStudentId` | `String?` | @unique @map("converted_student_id") |
| `convertedStudent` | `Student?` | @relation(fields: [convertedStudentId], references: [id]) |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `parentName` | `String?` | @map("parent_name") // Enquiry-stage "Parent name" quick-capture, before the fuller father/mother/guardian breakdown below |
| `address` | `String?` | @map("address") @db.Text // Enquiry-stage quick-capture address, before the fuller permanent/current split below |
| `photoPath` | `String?` | @map("photo_path") |
| `dob` | `DateTime?` |  |
| `gender` | `Gender?` |  |
| `bloodGroup` | `String?` | @map("blood_group") |
| `nationality` | `String?` |  |
| `caste` | `String?` |  |
| `religionCategory` | `String?` | @map("religion_category") // General/OBC/SC/ST/EWS |
| `motherTongue` | `String?` | @map("mother_tongue") |
| `studentAadhaarNumber` | `String?` | @map("student_aadhaar_number") |
| `fatherName` | `String?` | @map("father_name") |
| `motherName` | `String?` | @map("mother_name") |
| `guardianName` | `String?` | @map("guardian_name") |
| `fatherOccupation` | `String?` | @map("father_occupation") |
| `motherOccupation` | `String?` | @map("mother_occupation") |
| `contactNumber2` | `String?` | @map("contact_number_2") |
| `annualIncome` | `String?` | @map("annual_income") |
| `email` | `String?` |  |
| `parentAadhaarNumber` | `String?` | @map("parent_aadhaar_number") |
| `permanentAddress` | `String?` | @map("permanent_address") @db.Text |
| `currentAddress` | `String?` | @map("current_address") @db.Text |
| `pincode` | `String?` |  |
| `allergiesConditions` | `String?` | @map("allergies_conditions") @db.Text |
| `emergencyContactName` | `String?` | @map("emergency_contact_name") |
| `emergencyContactNumber` | `String?` | @map("emergency_contact_number") |
| `familyDoctorContact` | `String?` | @map("family_doctor_contact") |
| `udiseNumber` | `String?` | @map("udise_number") |
| `penNumber` | `String?` | @map("pen_number") |
| `approvalStatus` | `AdmissionApprovalStatus` | @default(NONE) @map("approval_status") |
| `submittedForApprovalAt` | `DateTime?` | @map("submitted_for_approval_at") |
| `approvalActionAt` | `DateTime?` | @map("approval_action_at") |

## Operations — Transport, Hostel & Library

**`VehicleLogType`** (enum): `SERVICE`, `INSURANCE_RENEWAL`, `OTHER`

**`HostelFacilityType`** (enum): `TOILET`, `SHOWER`

**`MealType`** (enum): `BREAKFAST`, `LUNCH`, `DINNER`

**`HostelOutingStatus`** (enum): `PENDING`, `APPROVED`, `REJECTED`

**`HostelAttendanceSession`** (enum): `MORNING`, `EVENING`, `NIGHT`

**`HostelAttendanceStatus`** (enum): `PRESENT`, `ABSENT`, `LATE`

**`HostelLogType`** (enum): `LAUNDRY`, `MAINTENANCE`

**`HostelLogStatus`** (enum): `PENDING`, `IN_PROGRESS`, `DONE`

**`LaundryStatus`** (enum): `PENDING`, `COLLECTED`

**`CirculationStatus`** (enum): `ISSUED`, `RETURNED`, `OVERDUE`

### `TransportRoute`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `vehicleId` | `String?` | @map("vehicle_id") |
| `vehicle` | `TransportVehicle?` | @relation(fields: [vehicleId], references: [id], onDelete: SetNull) |
| `feeAmount` | `Decimal?` | @map("fee_amount") @db.Decimal(10, 2) |
| `stops` | `TransportStop[]` |  |
| `assignments` | `StudentTransportAssignment[]` |  |
| `attendance` | `TransportAttendance[]` |  |

### `TransportVehicle`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `vehicleNo` | `String` | @map("vehicle_no") // registration number |
| `vehicleType` | `String?` | @map("vehicle_type") // e.g. "Bus", "Van", "Mini Bus" |
| `capacity` | `Int?` |  |
| `make` | `String?` |  |
| `model` | `String?` |  |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `notes` | `String?` | @db.Text |
| `driverName` | `String?` | @map("driver_name") |
| `driverPhone` | `String?` | @map("driver_phone") |
| `driverLicenseNo` | `String?` | @map("driver_license_no") |
| `driverLicenseExpiry` | `DateTime?` | @map("driver_license_expiry") |
| `insurancePolicyNo` | `String?` | @map("insurance_policy_no") |
| `insuranceExpiry` | `DateTime?` | @map("insurance_expiry") |
| `fitnessExpiry` | `DateTime?` | @map("fitness_expiry") |
| `pollutionCertExpiry` | `DateTime?` | @map("pollution_cert_expiry") |
| `lastKnownLat` | `Float?` | @map("last_known_lat") |
| `lastKnownLng` | `Float?` | @map("last_known_lng") |
| `lastLocationAt` | `DateTime?` | @map("last_location_at") |
| `routes` | `TransportRoute[]` |  |
| `serviceLogs` | `VehicleLog[]` |  |
| `documents` | `PersonDocument[]` |  |

### `VehicleLog`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `vehicleId` | `String` | @map("vehicle_id") |
| `vehicle` | `TransportVehicle` | @relation(fields: [vehicleId], references: [id], onDelete: Cascade) |
| `type` | `VehicleLogType` |  |
| `date` | `DateTime` | @db.Date |
| `description` | `String` | @db.Text |
| `cost` | `Decimal?` | @db.Decimal(10, 2) |
| `odometerReading` | `Int?` | @map("odometer_reading") |

### `TransportAttendance`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `routeId` | `String` | @map("route_id") |
| `route` | `TransportRoute` | @relation(fields: [routeId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `pickupAt` | `DateTime?` | @map("pickup_at") |
| `dropAt` | `DateTime?` | @map("drop_at") |

### `TransportStop`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `routeId` | `String` | @map("route_id") |
| `route` | `TransportRoute` | @relation(fields: [routeId], references: [id], onDelete: Cascade) |
| `stopName` | `String` | @map("stop_name") |
| `pickupTime` | `DateTime?` | @map("pickup_time") @db.Time |
| `sequence` | `Int` |  |
| `assignments` | `StudentTransportAssignment[]` |  |

### `StudentTransportAssignment`

| Field | Type | Attributes |
|---|---|---|
| `studentId` | `String` | @id @map("student_id") |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `routeId` | `String` | @map("route_id") |
| `route` | `TransportRoute` | @relation(fields: [routeId], references: [id]) |
| `stopId` | `String` | @map("stop_id") |
| `stop` | `TransportStop` | @relation(fields: [stopId], references: [id]) |

### `HostelRoom`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `roomNo` | `String` | @map("room_no") |
| `roomSize` | `String?` | @map("room_size") // free text, e.g. "12ft x 10ft" or "150 sq ft" — schools describe this differently, not worth forcing a single unit |
| `capacity` | `Int` |  |
| `roomType` | `String?` | @map("room_type") // e.g. "Dormitory", "Double", "Single" |
| `wardenStaffId` | `String?` | @map("warden_staff_id") |
| `warden` | `StaffProfile?` | @relation(fields: [wardenStaffId], references: [id], onDelete: SetNull) |
| `allocations` | `HostelAllocation[]` |  |
| `facilities` | `HostelFacility[]` |  |
| `maintenanceLogs` | `HostelMaintenanceLog[]` |  |
| `beds` | `HostelBed[]` |  |

### `HostelBed`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `roomId` | `String` | @map("room_id") |
| `room` | `HostelRoom` | @relation(fields: [roomId], references: [id], onDelete: Cascade) |
| `bedNo` | `String` | @map("bed_no") // e.g. "1", "A" — free text, same convention as roomNo |
| `allocation` | `HostelAllocation?` |  |

### `HostelFacility`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `roomId` | `String` | @map("room_id") |
| `room` | `HostelRoom` | @relation(fields: [roomId], references: [id], onDelete: Cascade) |
| `type` | `HostelFacilityType` |  |
| `label` | `String?` | // e.g. "Toilet 1" — optional, defaults to a generated "Toilet #N" in the UI when blank |
| `condition` | `String?` | // free text, e.g. "Good", "Needs repair" |
| `maintenanceLogs` | `HostelMaintenanceLog[]` |  |

### `HostelAllocation`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `roomId` | `String` | @map("room_id") |
| `room` | `HostelRoom` | @relation(fields: [roomId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `dateFrom` | `DateTime` | @map("date_from") |
| `bedId` | `String?` | @unique @map("bed_id") |
| `bed` | `HostelBed?` | @relation(fields: [bedId], references: [id], onDelete: SetNull) |

### `HostelMessMenu`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `dayOfWeek` | `Int` | @map("day_of_week") // 0 = Sunday .. 6 = Saturday, matches JS Date#getDay() |
| `mealType` | `MealType` | @map("meal_type") |
| `menuText` | `String` | @map("menu_text") @db.Text |

### `HostelVisitorLog`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `visitorName` | `String` | @map("visitor_name") |
| `relation` | `String?` |  |
| `purpose` | `String?` |  |
| `checkInAt` | `DateTime` | @default(now()) @map("check_in_at") |
| `checkOutAt` | `DateTime?` | @map("check_out_at") |

### `HostelOutingRequest`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `reason` | `String` |  |
| `dateFrom` | `DateTime` | @map("date_from") |
| `dateTo` | `DateTime` | @map("date_to") |
| `status` | `HostelOutingStatus` | @default(PENDING) |
| `requestedAt` | `DateTime` | @default(now()) @map("requested_at") |
| `actionAt` | `DateTime?` | @map("action_at") |

### `HostelAttendance`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `session` | `HostelAttendanceSession` |  |
| `status` | `HostelAttendanceStatus` |  |
| `markedByStaffId` | `String?` | @map("marked_by_staff_id") |
| `markedByStaff` | `StaffProfile?` | @relation(fields: [markedByStaffId], references: [id]) |

### `HostelMealServed`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `date` | `DateTime` | @db.Date |
| `mealType` | `MealType` | @map("meal_type") |
| `description` | `String` | @db.Text |
| `headcount` | `Int?` |  |

### `HostelMaintenanceLog`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `roomId` | `String?` | @map("room_id") |
| `room` | `HostelRoom?` | @relation(fields: [roomId], references: [id], onDelete: Cascade) |
| `facilityId` | `String?` | @map("facility_id") |
| `facility` | `HostelFacility?` | @relation(fields: [facilityId], references: [id], onDelete: Cascade) |
| `type` | `HostelLogType` |  |
| `date` | `DateTime` | @db.Date |
| `description` | `String` | @db.Text |
| `status` | `HostelLogStatus` | @default(PENDING) |

### `LaundryTicket`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `tokenNo` | `String` | @map("token_no") |
| `submittedAt` | `DateTime` | @default(now()) @map("submitted_at") |
| `collectionDate` | `DateTime?` | @map("collection_date") @db.Date |
| `collectedAt` | `DateTime?` | @map("collected_at") |
| `status` | `LaundryStatus` | @default(PENDING) |
| `items` | `LaundryItem[]` |  |

### `LaundryItem`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `ticketId` | `String` | @map("ticket_id") |
| `ticket` | `LaundryTicket` | @relation(fields: [ticketId], references: [id], onDelete: Cascade) |
| `itemType` | `String` | @map("item_type") |
| `quantity` | `Int` |  |

### `LibraryBook`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `title` | `String` |  |
| `author` | `String?` |  |
| `accessionNo` | `String` | @map("accession_no") |
| `category` | `String?` |  |
| `copiesTotal` | `Int` | @map("copies_total") |
| `copiesAvailable` | `Int` | @map("copies_available") |
| `isbn` | `String?` | // used for barcode/QR generation (via /api/qrcode) and the optional Open Library lookup |
| `circulation` | `LibraryCirculation[]` |  |

### `LibraryCirculation`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `bookId` | `String` | @map("book_id") |
| `book` | `LibraryBook` | @relation(fields: [bookId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `issueDate` | `DateTime` | @map("issue_date") |
| `dueDate` | `DateTime` | @map("due_date") |
| `returnDate` | `DateTime?` | @map("return_date") |
| `status` | `CirculationStatus` | @default(ISSUED) |
| `fineAmount` | `Decimal?` | @map("fine_amount") @db.Decimal(10, 2) // computed once, at return time, from School.libraryFineRatePerDay/libraryFineGraceDays — null when not overdue or feature off |

## Operations — Inventory & Assets

**`AssetStatus`** (enum): `IN_USE`, `IN_STORAGE`, `UNDER_REPAIR`, `DISPOSED`

**`StockMovementType`** (enum): `IN`, `OUT`

**`PurchaseOrderStatus`** (enum): `DRAFT`, `ORDERED`, `RECEIVED`, `CANCELLED`

### `InventoryAsset`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `category` | `String?` |  |
| `serialNo` | `String?` | @map("serial_no") |
| `location` | `String?` |  |
| `purchaseDate` | `DateTime` | @map("purchase_date") |
| `purchaseCost` | `Decimal` | @db.Decimal(12, 2) @map("purchase_cost") |
| `usefulLifeYears` | `Int` | @map("useful_life_years") |
| `status` | `AssetStatus` | @default(IN_USE) |
| `notes` | `String?` | @db.Text |

### `InventoryConsumable`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `category` | `String?` |  |
| `unit` | `String` | // e.g. "pcs", "box", "litre" |
| `quantityOnHand` | `Decimal` | @default(0) @db.Decimal(12, 2) @map("quantity_on_hand") // a cached running total — see InventoryStockMovement for the audit trail, same copiesAvailable-on-LibraryBook pattern |
| `reorderLevel` | `Decimal?` | @db.Decimal(12, 2) @map("reorder_level") // null = no reorder alert configured for this item |
| `movements` | `InventoryStockMovement[]` |  |
| `purchaseOrders` | `PurchaseOrder[]` |  |

### `InventoryStockMovement`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `consumableId` | `String` | @map("consumable_id") |
| `consumable` | `InventoryConsumable` | @relation(fields: [consumableId], references: [id], onDelete: Cascade) |
| `type` | `StockMovementType` |  |
| `quantity` | `Decimal` | @db.Decimal(12, 2) |
| `note` | `String?` |  |
| `date` | `DateTime` | @default(now()) |

### `SchoolVendor`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `category` | `String?` |  |
| `contactName` | `String?` | @map("contact_name") |
| `phone` | `String?` |  |
| `email` | `String?` |  |
| `isActive` | `Boolean` | @default(true) @map("is_active") |
| `purchaseOrders` | `PurchaseOrder[]` |  |

### `PurchaseOrder`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `poNumber` | `String` | @map("po_number") |
| `vendorId` | `String` | @map("vendor_id") |
| `vendor` | `SchoolVendor` | @relation(fields: [vendorId], references: [id]) |
| `consumableId` | `String?` | @map("consumable_id") // optional link — set when the PO is for restocking a tracked consumable |
| `consumable` | `InventoryConsumable?` | @relation(fields: [consumableId], references: [id]) |
| `itemDescription` | `String` | @map("item_description") |
| `quantity` | `Decimal` | @db.Decimal(12, 2) |
| `unitCost` | `Decimal` | @db.Decimal(12, 2) @map("unit_cost") |
| `status` | `PurchaseOrderStatus` | @default(DRAFT) |
| `orderDate` | `DateTime` | @map("order_date") |
| `receivedDate` | `DateTime?` | @map("received_date") |
| `notes` | `String?` | @db.Text |

### `InventoryStockItem`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` |  |
| `itemType` | `String?` | @map("item_type") // free text, e.g. "Stationery", "Uniform", "Book" |
| `itemCode` | `String?` | @map("item_code") // SKU / barcode text, optional |
| `costPrice` | `Decimal` | @db.Decimal(12, 2) @map("cost_price") |
| `sellPrice` | `Decimal` | @db.Decimal(12, 2) @map("sell_price") |
| `quantityOnHand` | `Decimal` | @default(0) @db.Decimal(12, 2) @map("quantity_on_hand") // cached running total — see InventoryStockItemMovement for the audit trail, same pattern as InventoryConsumable.quantityOnHand |
| `movements` | `InventoryStockItemMovement[]` |  |
| `saleLines` | `InventorySaleItem[]` |  |

### `InventoryStockItemMovement`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `stockItemId` | `String` | @map("stock_item_id") |
| `stockItem` | `InventoryStockItem` | @relation(fields: [stockItemId], references: [id], onDelete: Cascade) |
| `type` | `StockMovementType` |  |
| `quantity` | `Decimal` | @db.Decimal(12, 2) |
| `note` | `String?` |  |
| `date` | `DateTime` | @default(now()) |

### `InventorySale`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `consumerName` | `String` | @map("consumer_name") |
| `totalAmount` | `Decimal` | @db.Decimal(12, 2) @map("total_amount") |
| `soldAt` | `DateTime` | @default(now()) @map("sold_at") |
| `items` | `InventorySaleItem[]` |  |

### `InventorySaleItem`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `saleId` | `String` | @map("sale_id") |
| `sale` | `InventorySale` | @relation(fields: [saleId], references: [id], onDelete: Cascade) |
| `stockItemId` | `String` | @map("stock_item_id") |
| `stockItem` | `InventoryStockItem` | @relation(fields: [stockItemId], references: [id]) |
| `quantity` | `Decimal` | @db.Decimal(12, 2) |
| `unitPrice` | `Decimal` | @db.Decimal(12, 2) @map("unit_price") // sellPrice at the moment of sale — a later price edit doesn't rewrite history |
| `lineTotal` | `Decimal` | @db.Decimal(12, 2) @map("line_total") |

## Engagement

**`ChecklistStatus`** (enum): `PENDING`, `DONE`

**`CertificateType`** (enum): `BONAFIDE`, `TRANSFER`, `CHARACTER`, `ACHIEVEMENT`, `CUSTOM`

**`AudienceType`** (enum): `ALL_PARENTS`, `ALL_STAFF`, `SPECIFIC_CLASS`, `SPECIFIC_STUDENT`

**`AnnouncementApprovalStatus`** (enum): `PENDING`, `APPROVED`, `REJECTED`

### `Event`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `title` | `String` |  |
| `type` | `String?` |  |
| `date` | `DateTime` |  |
| `venue` | `String?` |  |
| `expectedAttendance` | `Int?` | @map("expected_attendance") |
| `budgetEstimate` | `Decimal?` | @map("budget_estimate") @db.Decimal(12, 2) |
| `checklistItems` | `EventChecklistItem[]` |  |

### `EventChecklistItem`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `eventId` | `String` | @map("event_id") |
| `event` | `Event` | @relation(fields: [eventId], references: [id], onDelete: Cascade) |
| `task` | `String` |  |
| `status` | `ChecklistStatus` | @default(PENDING) |

### `CertificateTemplate`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `type` | `CertificateType` |  |
| `label` | `String` | // shown in the Certificate Generator's template list, e.g. "Bonafide / Study Certificate" |
| `title` | `String` | // printed heading on the certificate itself, e.g. "Bonafide Certificate" |
| `bodyText` | `String` | @map("body_text") @db.Text |
| `logoPath` | `String?` | @map("logo_path") |
| `issued` | `CertificateIssued[]` |  |

### `CertificateIssued`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `studentId` | `String` | @map("student_id") |
| `student` | `Student` | @relation(fields: [studentId], references: [id], onDelete: Cascade) |
| `templateId` | `String` | @map("template_id") |
| `template` | `CertificateTemplate` | @relation(fields: [templateId], references: [id]) |
| `issuedDate` | `DateTime` | @map("issued_date") |
| `issuedByStaffId` | `String?` | @map("issued_by_staff_id") |
| `issuedByStaff` | `StaffProfile?` | @relation(fields: [issuedByStaffId], references: [id]) |
| `renderedBody` | `String` | @map("rendered_body") @db.Text |

### `Announcement`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `title` | `String` |  |
| `body` | `String` | @db.Text |
| `audienceType` | `AudienceType` | @map("audience_type") |
| `audienceTarget` | `String?` | @map("audience_target") // e.g. a classId or studentId |
| `publishedOn` | `DateTime?` | @map("published_on") |
| `scheduledFor` | `DateTime?` | @map("scheduled_for") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `approvalStatus` | `AnnouncementApprovalStatus` | @default(PENDING) @map("approval_status") |
| `reads` | `AnnouncementRead[]` |  |

### `AnnouncementRead`

| Field | Type | Attributes |
|---|---|---|
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `announcementId` | `String` | @map("announcement_id") |
| `announcement` | `Announcement` | @relation(fields: [announcementId], references: [id], onDelete: Cascade) |
| `userId` | `String` | @map("user_id") |
| `user` | `User` | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| `readOn` | `DateTime` | @default(now()) @map("read_on") |

## Settings

**`WebsiteElementType`** (enum): `TEXT`, `IMAGE`, `BUTTON`, `IMAGE_CAROUSEL`, `SHAPE`

**`IdCardAudience`** (enum): `STUDENT`, `STAFF`

**`IdCardOrientation`** (enum): `HORIZONTAL`, `VERTICAL`

**`IdCardElementType`** (enum): `TEXT // static label OR a {{mergeField}} token, substituted per person at generation time`, `IMAGE // a fixed image the admin uploads once (school logo, watermark, signature)`, `PHOTO // the per-person photo slot — filled from Student.photoPath / StaffProfile.photoPath`, `SHAPE`, `BARCODE // a QR code encoding a merge-field value (e.g. {{admissionNo}}) — text stores the token, rendered as a scannable code, not a raster/uploaded image`

### `WebsiteSettings`

| Field | Type | Attributes |
|---|---|---|
| `schoolId` | `String` | @id @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `canvasBackground` | `String?` | @map("canvas_background") |
| `publishedSnapshot` | `Json?` | @map("published_snapshot") |
| `publishedAt` | `DateTime?` | @map("published_at") |

### `WebsiteElement`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `type` | `WebsiteElementType` |  |
| `x` | `Int` |  |
| `y` | `Int` |  |
| `width` | `Int` |  |
| `height` | `Int` |  |
| `zIndex` | `Int` | @default(0) @map("z_index") |
| `visible` | `Boolean` | @default(true) |
| `text` | `String?` | @db.Text // TEXT body / BUTTON label |
| `href` | `String?` | // BUTTON link target, e.g. "#contact" or "mailto:..." |
| `imagePath` | `String?` | @map("image_path") // IMAGE (the logo is just an IMAGE element) |
| `images` | `String[]` | @default([]) // IMAGE_CAROUSEL — auto-scrolling strip of these |
| `fontSize` | `Int?` | @map("font_size") // TEXT/BUTTON, px |
| `fontFamily` | `String?` | @map("font_family") // TEXT/BUTTON |
| `fontWeight` | `Int?` | @map("font_weight") // TEXT/BUTTON, 400/600/700/800 |
| `italic` | `Boolean` | @default(false) // TEXT/BUTTON |
| `textAlign` | `String?` | @map("text_align") // TEXT/BUTTON — "left" \| "center" \| "right" |
| `color` | `String?` | // text color / button text color, hex |
| `backgroundColor` | `String?` | @map("background_color") // fill color — BUTTON, TEXT's own box, or SHAPE |
| `shapeKind` | `String?` | @map("shape_kind") // SHAPE only — "rectangle" \| "circle" |
| `borderColor` | `String?` | @map("border_color") // SHAPE outline |
| `borderWidth` | `Int?` | @map("border_width") // SHAPE outline, px |
| `borderRadius` | `Int?` | @map("border_radius") // SHAPE corner rounding, px (rectangle only — circle is always round) |

### `IdCardTemplate`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `name` | `String` | @default("Untitled template") |
| `audience` | `IdCardAudience` | @default(STUDENT) |
| `orientation` | `IdCardOrientation` | @default(HORIZONTAL) |
| `isActive` | `Boolean` | @default(false) @map("is_active") // the one used when a card is actually generated for this audience — @@unique below keeps at most one per audience |
| `backgroundColor` | `String?` | @map("background_color") |
| `createdAt` | `DateTime` | @default(now()) @map("created_at") |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |
| `elements` | `IdCardElement[]` |  |

### `IdCardElement`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `templateId` | `String` | @map("template_id") |
| `template` | `IdCardTemplate` | @relation(fields: [templateId], references: [id], onDelete: Cascade) |
| `type` | `IdCardElementType` |  |
| `x` | `Int` |  |
| `y` | `Int` |  |
| `width` | `Int` |  |
| `height` | `Int` |  |
| `zIndex` | `Int` | @default(0) @map("z_index") |
| `text` | `String?` | @db.Text // TEXT body — literal text, merge tokens, or a mix |
| `imagePath` | `String?` | @map("image_path") // IMAGE only |
| `fontSize` | `Int?` | @map("font_size") |
| `fontFamily` | `String?` | @map("font_family") |
| `fontWeight` | `Int?` | @map("font_weight") |
| `italic` | `Boolean` | @default(false) |
| `textAlign` | `String?` | @map("text_align") |
| `color` | `String?` |  |
| `backgroundColor` | `String?` | @map("background_color") |
| `shapeKind` | `String?` | @map("shape_kind") // SHAPE: "rectangle" \| "circle" (also doubles as PHOTO's crop shape) |
| `borderColor` | `String?` | @map("border_color") |
| `borderWidth` | `Int?` | @map("border_width") |
| `borderRadius` | `Int?` | @map("border_radius") |

### `ScreenCustomization`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `screenName` | `String` | @map("screen_name") // e.g. "students-list-view" |
| `config` | `Json` |  |

### `SchoolFeatureFlag`

| Field | Type | Attributes |
|---|---|---|
| `id` | `String` | @id @default(cuid()) |
| `schoolId` | `String` | @map("school_id") |
| `school` | `School` | @relation(fields: [schoolId], references: [id], onDelete: Cascade) |
| `key` | `String` | // one of FEATURE_REGISTRY's keys in lib/feature-flags.ts, e.g. "students.medicalInfo" |
| `enabled` | `Boolean` | @default(false) |
| `updatedAt` | `DateTime` | @updatedAt @map("updated_at") |
