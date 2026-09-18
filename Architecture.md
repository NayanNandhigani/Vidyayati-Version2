# Architecture — Vidyayati 2.0

This documents how the codebase is actually put together — the routing
structure, the auth/session model, the multi-tenancy enforcement mechanism,
and the cloud infrastructure it runs on. It is the **one official
architecture document** for this project; `claude.md` at the project root is
the product/design brief (what to build, in what order, on what visual
system). When the two overlap, `claude.md` wins on product decisions and this
file should be updated to match whatever gets built. `database.md` is the
field-level companion to the "Data model" section below. `memory.md` is the
sequential log of how this file's contents came to be.

This is a rebuild of an earlier version of this product (see `memory.md`,
2026-09-18 entry) that kept the product and most of the codebase unchanged
and replaced three things: the local-only development database, the bundled
demo/seed data, and local-disk file storage — all three because this version
is **cloud-only**, with no local-database code path at all.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript, one codebase for the
marketing site and the app. PostgreSQL via Prisma 6 (`prisma/schema.prisma`
— see `database.md` for the full field-level reference). Tailwind 3 for
styling, with design tokens as both Tailwind theme colors and CSS custom
properties in `app/globals.css`. Auth is NextAuth v5 (Auth.js) with a
Credentials provider (username + bcrypt password hash — not email; see "Auth
and session") — no OAuth or OTP provider wired up yet. Zod is available for
input validation.

Files are stored in **cloud object storage (AWS S3)** via `lib/storage.ts`
(`saveUploadedFile`/`readUploadedFile`/`deleteUploadedFile`), served back
through authenticated API routes rather than Next's `public/` folder. Every
call site across the app uses these same three functions regardless of
storage backend — the earlier version of this app used local disk under
`DATA/uploads`; that path does not survive most cloud hosts' ephemeral
containers, so this version moves it to S3 from the start. See "File
storage" below for the object-key layout.

There is no embedded/local database mode. See "Database" below.

## Route structure and portal split

Three top-level route groups under `app/`:

- `app/signin` — shared login page for every role (School Admin, Staff,
  Parent, Super Admin all authenticate through the same Credentials form;
  the role that comes back on the session decides where they land).
  `/login` redirects here permanently for old links.
- `app/app/*` — the school portal. Every module folder follows the same
  shape: a server-rendered `page.tsx`, an `actions.ts` (and often a
  `depth-actions.ts` for feature-flagged additions) for its server actions,
  and one or more client components for interactive pieces. Current module
  routes (see `components/sidebar-config.ts` for the definitive,
  always-current list): `dashboard`, `admissions`, `institute` (labeled
  "Academic Management" in the UI — Classes & Sections, Subjects, and Fee
  Structure as three tabs), `students`, `employees`, `attendance`, `exams`,
  `homework`, `timetable`, `teaching`, `fees`, `accounts`, `transport`,
  `hostel` (its own top-level module, not a Transport tab), `library`,
  `inventory`, `events`, `certificates`, `communication`, `reports`,
  `settings`.
- `app/super-admin/*` — the platform portal: `dashboard`, `schools`,
  `subscriptions`, `reports`, `settings`. Same page/actions/client-component
  pattern.
- `app/api/auth/[...nextauth]` — the NextAuth route handler. Other
  `app/api/*` routes serve uploaded files back out (`id-card-assets`,
  `person-documents`, `vehicle-documents`, `website-assets`,
  `certificate-assets`, `documents`) with tenant-isolation checks on the
  path's schoolId segment, reading through `lib/storage.ts` → S3.

Marketing/public content lives at the app root (`app/page.tsx`,
`app/layout.tsx`); it stays visually distinct (dark/high-tech) from the app
shell (light, dense), per `claude.md`.

`components/` holds the shared app shell: `Sidebar.tsx` plus
`sidebar-config.ts`, the single source of truth for the nav — each `NavItem`
declares its href/icon, which `StaffPermission.moduleName` it's gated
behind, and which roles can see it at all. Also here: `Avatar.tsx` and
`ProfilePhotoUpload.tsx` (shared profile-picture display/upload),
`PersonDocumentsPanel.tsx` (shared document-upload UI),
`SortableHeader.tsx`, `AuditLogTable.tsx`.

## Auth and session

Split across two files because Next.js middleware always runs on the Edge
runtime, which can't load bcrypt or the Prisma client:

- `auth.config.ts` — the Edge-safe half: JWT session strategy, `/signin` as
  the sign-in page, the `jwt`/`session` callbacks that carry `role`,
  `schoolId`, and `username` from the JWT onto `session.user`. No
  providers.
- `auth.ts` — extends `auth.config.ts` with the actual Credentials provider
  (looks up `User` by `username`, lowercased and trimmed at both write and
  lookup time — not email — checks `status === "ACTIVE"`, verifies the
  bcrypt hash). On a successful login it also stamps `User.lastLoginAt` and
  writes a `LOGIN` `ActivityLog` row.
- `middleware.ts` — imports only `auth.config.ts`. Gates `/app/:path*` and
  `/super-admin/:path*`, redirects unauthenticated requests to `/signin`
  with a `callbackUrl`, and cross-redirects a logged-in user to the portal
  matching their role.

A session's `user` object carries `role` (`SCHOOL_ADMIN` / `STAFF` /
`PARENT` / `SUPER_ADMIN` / `PLATFORM_STAFF`), `schoolId` (`null` for the two
platform roles), and `username`.

**`AUTH_URL` is required in production**, set to the app's exact public
HTTPS URL. `trustHost: true` alone is not sufficient behind every reverse
proxy — without `AUTH_URL`, NextAuth can misconstruct absolute URLs it
generates internally, which surfaced in production as `/signin` returning
an infinite self-redirect (HTTP 307) on Railway. Not needed for local dev.

**Account creation, always through the same one-time setup flow, no
exceptions:** every account — the first Super Admin included — is created
via `lib/account-setup.ts`'s `createPendingAccount()`. No password is ever
hardcoded, seeded, or defaulted. Instead, a one-time setup token is
generated, only its SHA-256 hash is persisted (`User.setupTokenHash`,
unique-indexed, with an expiry), and the raw token is shown exactly once:
via `SetupLinkBanner.tsx` on a new account's detail page for accounts an
admin creates through the UI, or printed to the deploy log for the very
first Super Admin (see "Bootstrapping the first account" below). The
recipient visits `/setup-account?token=...` to set their own password
before they can log in (`mustChangePassword` gates this).

### Bootstrapping the first account

This project ships with **no seed data** (see `memory.md`). A brand-new
database has zero rows, including zero users — so a fresh deployment needs
a first Super Admin from somewhere. `scripts/bootstrap-admin.ts`
(`npm run bootstrap-admin`) handles it, and `scripts/migrate.sh` (the
pre-deploy step every deploy already runs, see "Database") calls it
automatically whenever `BOOTSTRAP_ADMIN_USERNAME` is set — set that one
variable and a fresh deploy is usable with no separate manual step. It can
also be run by hand at any time (e.g. a provider without a pre-deploy hook,
per `Deployment.md`). It:

1. Checks whether a `SUPER_ADMIN` user already exists — if so, does nothing
   (safe to re-run, and runs on *every* deploy via `migrate.sh`, not just
   the first — this is what makes that safe).
2. Otherwise reads `BOOTSTRAP_ADMIN_USERNAME` (required) and
   `BOOTSTRAP_ADMIN_NAME` / `BOOTSTRAP_ADMIN_EMAIL` (optional) from the
   environment and creates that Super Admin through the exact same
   `createPendingAccount()` path every other account uses.
3. Prints the one-time `/setup-account?token=...` link to the console.

The link only ever prints once — read it from the deploy logs after the
first deploy (or the logs of a manual run) — see `Deployment.md`.

## Activity logging

The `ActivityLog` model (`type: LOGIN | PAGE_VIEW`, optional `module`,
`occurredAt`) backs the Super Admin's per-school engagement view:

- **Logins**: `auth.ts`'s `authorize()` writes one `LOGIN` row per
  successful sign-in.
- **Page views**: `app/app/layout.tsx` wraps every school-portal request;
  `middleware.ts` stamps the current pathname onto an `x-pathname` header,
  and the layout resolves it to a human label via `moduleLabelForPath()` in
  `sidebar-config.ts`.

`MutationAuditLog` is a separate, distinct concern: who changed what data
(not who viewed what page). It's append-only and system-written for an
allowlist of models by the scoped Prisma client extension (see
"Multi-tenancy enforcement"). `changes` is a JSON diff.

`User.lastLoginAt` is a denormalized convenience alongside `ActivityLog`.

## Database

**Cloud PostgreSQL, always — no local database mode.** `DATABASE_URL` in
`.env` points at a real cloud Postgres instance for every environment,
local development included: a free/dev-tier database on Neon, Railway
Postgres, or Supabase all work unchanged, since the app only ever talks to
Postgres through Prisma's connection string — nothing in the code cares
which provider is on the other end. See `Deployment.md` for setup steps for
each provider.

Backups are whatever mechanism the chosen provider offers (Neon and
Supabase both support point-in-time recovery on paid tiers; a logical
export via `pg_dump` against `DATABASE_URL` always works as a
provider-independent fallback).

## Multi-tenancy enforcement

This is the load-bearing piece of the whole app, centralized in
`lib/tenant-db.ts` rather than left to each route to get right:

- At module load, it walks the Prisma DMMF and builds
  `TENANT_SCOPED_MODELS` — every model that has a `schoolId` field —
  instead of hardcoding a list, so a new model is automatically covered the
  moment someone adds `schoolId` to it in the schema.
- `scopedDb(schoolId)` returns a Prisma Client extension that intercepts
  every query against a tenant-scoped model: reads/updates/deletes get
  `schoolId` merged into `where`, creates get `schoolId` stamped onto
  `data`, upserts get it in both. Non-tenant-scoped models (platform-level
  things like `School` itself, `SubscriptionPlan`, `LedgerAccount`/`Vendor`/
  `Bill` on the platform-accounting side) pass through untouched.
- `getScopedDb()` is the call-site API: it pulls `schoolId` off the current
  session via `auth()` and returns a client scoped to it. It throws if
  there's no session or no `schoolId` — deliberate, since a Super Admin
  session has neither and Super Admin code is expected to import the raw
  `db` export from `lib/db.ts` and query across schools on purpose.
- `scopedCreateData()` is a small typing helper so call sites can omit
  `schoolId` from a Prisma create payload without an inline cast at every
  call site.

The rule this enforces: **every school-portal route reads/writes through
`getScopedDb()`, never the raw `db` export.** The raw client is for Super
Admin routes and platform-level models only.

Client-supplied IDs (a `classId`, `studentId`, `examId`, etc. arriving in a
form or query param) are still only as safe as the query that uses them —
`getScopedDb()` guarantees the *row itself* is scoped to the right school,
but does not validate *other* foreign-key ids referenced in that row's
data. The pattern: before any create/upsert that takes a client-supplied
relation id, look it up first through the same scoped client
(`sdb.<model>.findUniqueOrThrow({ where: { id } })`), which 404s on a
cross-tenant id before the write happens.

## Permissions within a school

Staff access is per-module, not a fixed role — enforced by
`lib/permissions.ts`. `requireModuleAccess(moduleName, minimum)` checks the
current session: School Admins get `EDIT` on everything implicitly; Staff
get whatever `AccessLevel` their `StaffPermission` row for that module says.
**The access ladder is two-tier above NONE: `NONE < VIEW < EDIT`.**

A `StaffPermission` row with `classId = null` is school-wide for that
module; a row with a real `classId` restricts it to one class, and the
school-wide row always wins if both exist.

The Super Admin portal mirrors this exactly for Vidyayati's own team:
`PlatformStaffPermission` gates `PLATFORM_STAFF` sessions per platform
module; `SUPER_ADMIN` sessions get implicit full access.

## File storage

`lib/storage.ts` exposes three functions used across ~16 call sites:
`saveUploadedFile(subdir, originalName, bytes)`,
`readUploadedFile(storagePath)`, `deleteUploadedFile(storagePath)`. Every
caller deals only in `storagePath` (e.g.
`"certificate-logos/<uuid>-name.png"`) regardless of backend — this version
implements it against AWS S3: `storagePath` doubles as the S3 object key,
uploaded via `PutObjectCommand` to the bucket in `AWS_S3_BUCKET`. The S3
client is built lazily (not at module load) so importing the file never
requires AWS credentials to be present — only actually calling one of the
three functions does, which matters for `next build` importing every route
module. `S3_ENDPOINT` is an optional override for an S3-compatible provider
other than AWS (Cloudflare R2, or MinIO for local testing).

## Data model

`prisma/schema.prisma` — see `database.md` for the full field-level
reference organized by domain with relationship notes. Two schema
conventions worth knowing: every non-platform model denormalizes
`schoolId` directly onto itself (even where it's only transitively related
to `School`) specifically so `tenant-db.ts` can scope centrally; and
`AccountsTransaction` is intentionally simple cash-in/cash-out rather than
double-entry — `FeePayment`, `PayrollRun`, `PurchaseOrder` (on receipt),
`InventorySale`, and `LibraryCirculation` (fines) all write a matching
`AccountsTransaction` row automatically so the ledger self-maintains.

Fee allocation is per-**grade**, not per-class-section: `ClassFeeDefault`
keys on `(yearId, grade)` and is read live wherever a student's "actual
fee" is needed, never copied onto the student. A student's own
`chargedFee` lives on `Student`; scholarship is always `actualFee −
chargedFee`, computed at read time, never stored.

`School` also carries a unique `code`, an optional `relationshipManager`
(free-text), and a large block of per-school configuration (fee/attendance/
payroll compliance rates, module toggles via `disabledModules`, seat caps).
`SchoolFeatureFlag` is a second, more granular axis on top of
`disabledModules` — where `disabledModules` turns an entire module off,
`SchoolFeatureFlag` turns individual sub-features within an enabled module
on/off (see `lib/feature-flags.ts` for the registry).

## What's stubbed or deferred

No payment gateway (fee/invoice/payment rows exist, entered manually, no
checkout flow), no WhatsApp/SMS/Email/push notifications (Communication is
in-app only), no biometric/RFID attendance (manual entry by Staff only),
and phone-OTP login for parents is not implemented — the Credentials
provider covers all five roles the same way, by username + password. A
real threaded messaging/notification system (replacing the one-way
Announcements board) is scoped for a later phase pending a dedicated design
pass. A consistent Zod-validation sweep across every server action, an
automated test suite, and a CI/CD pipeline are being built alongside this
rebuild rather than deferred — see `memory.md` for what's landed so far.

## Prior version

This product previously ran with a local-only development database
(`embedded-postgres`, no hosted DB required for local dev), bundled demo
seed data (`prisma/seed.ts`, a deterministic single-school dataset), and
local-disk file storage. All three were removed in this rebuild in favor of
a cloud-only architecture — see `memory.md`'s 2026-09-18 entry for the full
rationale. The prior version's own architecture notes (including its
"Architecture V1" hardening-roadmap history) live in its own repository
history if that context is ever needed again; this document describes the
system as it exists now, not that history.
