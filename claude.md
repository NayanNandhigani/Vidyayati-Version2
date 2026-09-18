# Vidyayati 2.0 — project brief

The product/design brief: what this is, what's in scope, what the visual
system is. `Architecture.md` is the companion "how it's built" document —
when the two disagree on a product decision, this file wins and
`Architecture.md` should be updated to match.

## What this is

Vidyayati is a multi-tenant school & kindergarten management SaaS for the
Indian market. Vidyayati (the company) sells annual subscriptions to
individual schools ("tenants"). Each school gets its own isolated data and
its own set of users.

Two portals:

- **Super Admin portal** — used by the Vidyayati team, not by schools.
  Onboards schools, tracks subscription billing/invoicing, sees
  cross-school platform reports, manages platform-wide settings.
- **School Admin / Staff / Parent portal** — used by an individual school.
  One login system, three roles:
  - **Admin** (school-level administrator)
  - **Staff** (teachers and non-teaching staff — permissions are granted
    per module, not by a fixed "Teacher" role; see Staff Permissions in
    `Architecture.md`)
  - **Parent**

Students and Teachers don't get their own accounts; Staff and Parent cover
everyone who needs app access.

## This is a rebuild — what changed and why

Vidyayati 2.0 is a from-scratch rebuild of an earlier, already-working
version of this same product (99+ Prisma models, ~20 modules, both
portals, client-approved design). The product did not change; three
infrastructure decisions did, because this version is **cloud-only**:

- **No local-only development database.** The earlier version ran a real
  Postgres as a local child process for dev, with no hosted database
  required. This version always talks to a hosted cloud Postgres — dev
  included — because there is no other database path in the code anymore.
- **No seed/demo data.** The earlier version shipped a deterministic
  single-school demo dataset (`prisma/seed.ts`) and a default Super Admin
  password. Neither exists now — see `Architecture.md` → "Bootstrapping the
  first account" for how a fresh deployment gets its first user instead.
- **Cloud file storage.** Uploaded files (ID photos, certificates,
  documents) moved from local disk to AWS S3, since a container filesystem
  on most cloud hosts doesn't persist.

Full detail and rationale: `memory.md`'s 2026-09-18 entry.

## On hold — do not build yet

- **Online payments** (fee collection, subscription billing) — no payment
  gateway integration. Fee/invoice/payment records still exist in the data
  model (a school admin or Vidyayati staff records a payment manually),
  just not an online checkout flow.
- **WhatsApp / SMS messaging** — the Communication/Announcements module is
  **in-app only**. Don't wire up any external messaging provider.
- **A real threaded messaging/notification system** (replacing the
  one-way Announcements broadcast) — held for a dedicated design pass, not
  because it's hard, but because it has no existing screen to extend.

Say the word and any of these come into scope — until then, don't let their
absence block anything else.

## Attendance

Marked manually by a teacher inside the app (Staff role, Attendance
module) — no biometric/RFID/external integration.

## Tech stack (decided)

- **Next.js (App Router) + TypeScript**, one codebase for the marketing
  site and the app itself.
- **PostgreSQL via Prisma**, hosted on a managed cloud provider (Neon,
  Railway Postgres, or Supabase — see `Deployment.md`). No local database
  mode.
- **AWS S3** for uploaded files (`lib/storage.ts`).
- **Tailwind CSS**, configured in `tailwind.config.ts` with the design
  tokens as custom colors (`bg-marigold`, `text-critical`, etc.) — the
  same hex values also live as CSS custom properties in
  `app/globals.css`.
- **NextAuth (Auth.js)**, Credentials provider (username + bcrypt password
  hash), one login form for all four roles. OTP-based phone login for
  parents remains a possible future addition, not yet built.

## Multi-tenancy

Every table below the platform level carries a `schoolId`. The rule for
every query in the app: **a session belongs to exactly one school** (or to
no school, for Super Admin), and every query must be scoped to it. The
Super Admin portal is the only place allowed to query across schools.
Enforced centrally via a Prisma Client extension (`lib/tenant-db.ts`) —
see `Architecture.md` for the mechanism. A tenant-isolation bug here is the
single worst thing this app could ship with.

## Design system

Colors, type, and shared component patterns (`.card`, `.pill`, `.field`,
sidebar nav items, etc.) are fully specified in `app/globals.css` and
`tailwind.config.ts` — use them as-is rather than inventing new ones.
Fonts: **Fraunces** (display headings — `.disp` class or `font-display` in
Tailwind), **Plus Jakarta Sans** (body/UI — default), **IBM Plex Mono**
(numbers, IDs, timestamps — `.mono` class or `font-mono`).

Color tokens and what they mean (all defined in `globals.css`):
`--ink`/`--ink2` (primary text), `--paper` (page background), `--card`
(surface background), `--line` (borders), `--muted`/`--faint` (secondary
text), `--marigold` (primary brand/accent), `--teal`, `--clay` (secondary
accents), `--good` (success — "Paid", "Present"), `--warn` (caution —
"Late", "Expiring"), `--critical` (negative — "Absent", "Overdue"), `--info`
(neutral informational).

The **marketing site** (public, pre-login) is visually distinct from the
app — "high tech" / dark-themed, more visually ambitious. The **app itself**
(post-login, all three roles + Super Admin) stays light, functional, and
information-dense. Don't carry the dark marketing aesthetic into the app
shell.

**Every module should be built to a genuinely high visual/functional
standard** — nothing should read as a stub, placeholder, or "coming later."
Every control a user can reach needs to actually do something.

## Data model

`prisma/schema.prisma` is the working schema. `database.md` is the
field-level reference for every table, grouped by domain — Platform &
Billing, Sales/Contracts/Records, Platform Accounting, People & Access,
Academics, Finance, Admissions, Transport, Hostel, Library, Inventory,
Engagement, Website & Settings. `design-reference/data-model.html`
documents the *original* 41-model data dictionary from the design phase —
historical context only, not current.

`AccountsTransaction` is deliberately simple cash-in/cash-out, not formal
double-entry accounting — don't over-engineer it. Fee payments and payroll
runs write a matching `AccountsTransaction` row automatically so the
school's cash-flow ledger stays correct without the admin re-entering
anything.

## The screens to build — and the ground truth for each

`design-reference/sections/` has one `<Module>.section.html` +
`<Module>.style.css` pair per screen — hand-built, framework-free HTML/CSS/
JS fragments from a client-reviewed clickable prototype. **Treat these as
the authoritative interaction spec** — what fields exist, what a click
does, what states a status pill can be in — not just a rough sketch. Every
module listed below has at least a full first pass built as a real
Next.js route/component with real data from Postgres via Prisma.

Module list (School Admin/Staff/Parent portal): Dashboard, Admissions,
Academic Management, Students, Employees, Attendance, Exams, Homework,
Timetable, Fees, Accounts, Transport, Hostel, Library, Inventory, Events,
Certificates, Communication, Reports, Settings.

Module list (Super Admin portal): Dashboard, Schools, Subscriptions &
Billing, Reports, Settings.

## Documentation set

Five governing docs, kept current as the project evolves:

- **`Architecture.md`** — how it's built (this file's companion).
- **`claude.md`** — this file — what to build and why.
- **`memory.md`** — sequential, dated log of every change, oldest first.
- **`database.md`** — field-level schema reference.
- **`Deployment.md`** — how to deploy this project from zero, for any
  supported provider.

Plus a `Dockerfile` for containerized deployment on any Docker-compatible
host.
