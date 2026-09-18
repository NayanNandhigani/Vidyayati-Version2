# Memory — sequential project log

Every meaningful change to this project, in order, oldest first. This file
is append-only — new entries go at the bottom; existing entries never get
rewritten or deleted, even if something they describe later changes (a
later entry records the change instead).

---

## 2026-09-18 — Phase 1: plan, and the rebuild's foundation

**Context.** Vidyayati 2.0 is a ground-up rebuild of an existing, working
product — `NayanNandhigani/Vidyayati` — reviewed in full (`CLAUDE.md`,
`ARCHITECTURE.md`, `prisma/schema.prisma`, `design-reference/`) to produce
this rebuild's plan. That plan was written up as a Project Proposal
document (charts, architecture, open decisions) and shared for review.

**Decisions made** (recorded in the proposal document; carried into this
repo):
- Database: provider-agnostic — standard `DATABASE_URL` Postgres via
  Prisma, documented for Neon, Railway Postgres, and Supabase in
  `Deployment.md`.
- File storage: AWS S3.
- App hosting: provider-agnostic Docker image, documented for Railway,
  Render, Fly.io, and Vercel in `Deployment.md`.
- Launch scope: full rebuild (all ~20 modules) to parity with the current
  product before go-live, not an MVP slice.

**What changed from the prior version, and why:**

1. **Removed the local-only development database.** The prior version ran
   Postgres locally via `embedded-postgres` (`scripts/local-db.ts`,
   `npm run db:local`) so local dev needed no hosted database. This
   version has no local-database code path at all — `DATABASE_URL` always
   points at a real cloud Postgres instance, dev environments included.
   `embedded-postgres` was removed from `package.json`.
2. **Removed all seed/demo data.** `prisma/seed.ts` (a deterministic
   single-school demo dataset, ~1000 lines) and the `npm run db:seed`
   script are gone. This removed the project's only source of a "first
   user" on a fresh database, so a replacement was needed —
   `scripts/bootstrap-admin.ts` (`npm run bootstrap-admin`) creates the
   first Super Admin account from `BOOTSTRAP_ADMIN_USERNAME`/`_NAME`/
   `_EMAIL` environment variables, through the same one-time
   `setupTokenHash` flow every other account already used (no password is
   ever hardcoded or seeded). Documented in `Architecture.md` →
   "Bootstrapping the first account".
3. **Moved file storage from local disk to AWS S3.** `lib/storage.ts`'s
   three exported functions (`saveUploadedFile`, `readUploadedFile`,
   `deleteUploadedFile`) kept their exact signatures — every one of the
   ~16 call sites across the app (certificate assets, ID cards, person
   documents, vehicle documents, website assets, school documents) needed
   zero changes. The implementation now uses `@aws-sdk/client-s3`, with a
   lazily-constructed client so importing the module never requires AWS
   credentials at build time.
4. **Five governing docs and a `memory.md`.** This is that file. The other
   four (`Architecture.md`, `claude.md`, `database.md`, `Deployment.md`)
   were written/regenerated for this rebuild — `database.md` is generated
   directly from `prisma/schema.prisma` rather than hand-maintained, so it
   can't silently drift from the schema.
5. **Everything else carried over unchanged**: the product itself (two
   portals, ~20 modules, multi-tenancy model, permission system, design
   system), the Prisma schema (107 models / 63 enums), the auth model
   (NextAuth Credentials provider), and the Dockerfile's multi-stage build
   approach (kept, generalized to stay host-agnostic).

**Repository setup.** GitHub repository `NayanNandhigani/Vidyayati-Version2`
created; this rebuild develops on branch
`claude/vidyayati-2-saas-rebuild-peufo9`.

**Status at end of this entry:** foundation in place (schema, auth,
multi-tenancy, permissions, all ~25 screens carried over from the working
prior version; storage layer rebuilt against S3; seed data and local-DB
tooling removed; bootstrap-admin flow added; all five docs plus Dockerfile
in the repo). Not yet done: dependency install/build verification in this
environment, CI workflow, docker-compose for local testing against a cloud
DB, first push to GitHub. See the next entry for what happens after those
land.
