# Vidyayati 2.0

Multi-tenant school/kindergarten management SaaS — cloud-only rebuild. See
**`claude.md`** for the product/design brief and **`Architecture.md`** for
how the codebase is actually put together (routing, auth, multi-tenancy,
permissions, data model). **`database.md`** is the field-level schema
reference, **`Deployment.md`** covers deploying this live, and
**`memory.md`** is the sequential log of every change made to this project.

This file is just setup steps.

## First-time setup

There is no local-database mode — `DATABASE_URL` always points at a real
cloud Postgres instance, even for local development. See `Deployment.md`
for provisioning one (Neon, Railway Postgres, or Supabase all work).

```bash
npm install

cp .env.example .env
# edit .env:
#   DATABASE_URL        — a cloud Postgres connection string (see Deployment.md)
#   AUTH_SECRET          — generate with `openssl rand -base64 32`
#   AWS_* / AWS_S3_BUCKET — an S3 bucket for file uploads (see Deployment.md)

npx prisma validate       # confirm the schema is well-formed
npx prisma migrate deploy # applies every migration

npm run bootstrap-admin   # creates the first Super Admin account — there is
                           # no seed data, so this is required on a fresh
                           # database. Reads BOOTSTRAP_ADMIN_USERNAME (and
                           # optionally _NAME / _EMAIL) from .env and prints
                           # a one-time setup link.

npm run dev                # http://localhost:3000
```

Then visit the one-time `/setup-account?token=...` link `bootstrap-admin`
printed to set a real password for the Super Admin account. Every other
account (School Admins, Staff, Parents) is created the same way from
inside the app, never seeded.

## What's here

- `prisma/schema.prisma` — the full data model (107 models, 63 enums) — see
  `database.md` for the field-level reference.
- `app/app/*` — the school portal (Dashboard, Admissions, Academic
  Management, Students, Employees, Attendance, Exams, Homework, Timetable,
  Fees, Accounts, Transport, Hostel, Library, Inventory, Events,
  Certificates, Communication, Reports, Settings).
- `app/super-admin/*` — the platform portal Vidyayati's own team uses
  (Schools, Subscriptions & Billing, Reports, Settings).
- `app/globals.css`, `tailwind.config.ts` — the approved design tokens
  (colors, fonts).
- `design-reference/sections/` — the original clickable-prototype
  fragments reviewed during design. Still useful as an interaction
  reference for a screen's original intent.
- `lib/storage.ts` — cloud file storage (AWS S3).
- `scripts/bootstrap-admin.ts` — creates the first Super Admin account on
  a fresh database (see above; no seed data exists in this project).
- `Dockerfile` / `docker-compose.yml` — containerized deployment, host-
  agnostic (Railway, Render, Fly.io, or any Docker host — see
  `Deployment.md`).
- `.github/workflows/ci.yml` — lint, typecheck, and build on every push.

## Documentation set

| File | What it covers |
|---|---|
| `claude.md` | Product/design brief — what to build and why |
| `Architecture.md` | How the codebase is built — routing, auth, multi-tenancy, permissions |
| `database.md` | Full field-level schema reference, generated from `prisma/schema.prisma` |
| `Deployment.md` | Step-by-step deploy guide for every supported provider |
| `memory.md` | Sequential, dated log of every change made to this project |
