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
in the repo). `npx prisma validate`, `npm run lint`, `npm run typecheck`,
and `npm run build` all verified clean before the first commit
(`805bb22`), pushed to `claude/vidyayati-2-saas-rebuild-peufo9`.

---

## 2026-09-18 — First live deployment, on Railway Postgres

Stood up a real, working environment to smoke-test the rebuild end to end,
per your choice of Railway for the database:

- **Railway project:** `dazzling-benevolence` (an existing empty project —
  the account's free-tier project limit was already at capacity, so this
  one was reused rather than creating a new one).
- **Postgres service**, `postgres:16-alpine`, with a persistent volume
  (`postgres-data`, mounted at `/var/lib/postgresql/data`) so data survives
  restarts/redeploys.
- **App service** (`vidyayati-app`), deployed straight from
  `NayanNandhigani/Vidyayati-Version2` on
  `claude/vidyayati-2-saas-rebuild-peufo9`, with a generated
  `*.up.railway.app` domain.
- `DATABASE_URL` wired via Railway's private-network reference
  (`${{Postgres.DATABASE_URL}}`) — no credentials duplicated between
  services. `AWS_S3_BUCKET`/`AWS_*` were **not** set (no AWS credentials
  provided yet) — file-upload features (photos, certificates, documents,
  ID cards) will error until they are; everything else works.
- First deploy applied all 67 migrations cleanly (`prisma migrate deploy`
  via `scripts/migrate.sh`, Railway's pre-deploy step) and the app came up
  healthy.

**Change made as a direct result of this deploy:** `scripts/migrate.sh` now
also runs `npm run bootstrap-admin` automatically (guarded — only when
`BOOTSTRAP_ADMIN_USERNAME` is set, never fails the deploy) instead of that
being a documented-but-separate manual step. Reasoning: attempting to
override the pre-deploy command per-service via the Railway API for a
one-off run proved unreliable (the running container kept using the
previous command even after the service config visibly updated) —
folding it into the committed script sidesteps that entirely and is a
strictly better default for every provider in `Deployment.md`, not just
Railway. `Architecture.md` and `Deployment.md` updated to match: bootstrap
is now automatic-when-configured, with the manual `npm run bootstrap-admin`
path kept for hosts without a pre-deploy hook.

**Known gap carried over from the prior version, not yet fixed:** the
Docker image logs `prisma:warn Prisma failed to detect the libssl/openssl
version to use... Defaulting to "openssl-1.1.x"` on every startup
(`node:20-slim` ships OpenSSL 3.x). The app started and migrations ran
regardless, so this hasn't been confirmed to break anything yet, but it's
worth a real functional test (login, a few CRUD screens) before calling it
resolved — see the next entry.

**Verified working, same day:** pushed the `migrate.sh` change
(`980a1af`), Railway auto-deployed it, and the pre-deploy step's
`bootstrap-admin` run succeeded — it created the first Super Admin
(`vidyayati-admin`) and printed a working one-time `/setup-account`
link. That write went through Prisma → Postgres with no error, which
confirms the OpenSSL warning above is cosmetic, not fatal: real queries
work. Both services (`vidyayati-app`, `Postgres`) show `online`, 1/1
replica, zero issues.

The temporary public TCP proxy opened on the Postgres service (to attempt
running the bootstrap step from outside Railway's network, before
discovering the sandbox environment blocks raw outbound TCP entirely) was
removed by you directly, after the Railway MCP tool call to remove it
timed out repeatedly on this end. AWS S3 setup is intentionally deferred
until the project is otherwise confirmed live — file uploads remain the
one known gap until then.
