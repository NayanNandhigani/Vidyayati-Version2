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

---

## 2026-09-18 — `/signin` infinite redirect loop in production

You reported `https://vidyayati-app-production-8892.up.railway.app/signin`
failing with `ERR_TOO_MANY_REDIRECTS` in a fresh incognito window.

**Diagnosis.** Railway's HTTP logs confirmed every `GET /signin` returned
`307` (not `308`, ruling out `next.config.js`'s only `redirects()` rule,
which is `permanent: true`). Deploy logs showed the page's own debug
`console.log` firing on every single request — the component genuinely
renders — yet the response was still a redirect back to the same URL.
Middleware's debug log never fired (its `matcher` correctly excludes
`/signin`), and a full re-read of every file in the render path
(`app/layout.tsx`, `app/signin/page.tsx`, `app/signin/LoginForm.tsx`,
`app/signin/actions.ts`) turned up no `redirect()` call that could fire on
a plain `GET`.

This turned out to be a **known, previously-unresolved issue already
documented in the source project's own git history** (fetched from
`NayanNandhigani/Vidyayati` for context — not part of this repo's
history). Commits `e95cd67`, `b18cfe6`, and `e9a9722` show the original
team hit the exact same self-redirect symptom twice before (on `/login`,
fixed by renaming to `/signin`; on `/` , fixed by forcing
`dynamic = "force-dynamic"`), then hit it a third time on `/signin`
itself and left it unresolved — mid-investigation, with temporary debug
logging still in place (which is why our copy of the code had it too) and
a `Cache-Control: no-store` `headers()` block removed "to isolate the
cause," never restored.

**Fix applied:** set `AUTH_URL` to the app's exact public HTTPS domain.
This is Auth.js's own documented recommendation for self-hosted/non-Vercel
deployments — `trustHost: true` (already set) is necessary but not always
sufficient behind a reverse proxy; without `AUTH_URL`, NextAuth can
misconstruct absolute URLs it generates internally. Restored the
`Cache-Control: no-store` `headers()` block the prior team had pulled out
as a second line of defense against any caching layer. Documented `AUTH_URL`
as a required production variable in `Architecture.md`, `Deployment.md`,
and `.env.example` (it wasn't captured anywhere before — a real gap in the
original brief this project builds on, not something introduced by
cloud-only-izing it).

Left the temporary `[page-debug]`/`[middleware-debug]` console.log
statements in place for this one deploy, specifically to confirm the fix
before removing them — the next entry should confirm success and clean
those up.

---

## 2026-09-20 — Railway redirect loop: unresolved after four fix attempts; moving to Render

Continued the `/signin` investigation. In order, all deployed and
retested against the live URL:

1. **`AUTH_URL` set to the exact public domain** — no change.
2. **Restored `next.config.js`'s `Cache-Control: no-store` `headers()`**
   (had been pulled by the original team while debugging the same issue on
   the source project) — no change.
3. **Forced the Railway service off its default Railpack builder onto the
   project's actual `Dockerfile`** (`get-service-config` had shown
   `build.builder: RAILPACK` despite `railway.json` specifying
   `DOCKERFILE` — Railway's own service config silently overrides the
   repo file). Confirmed via build logs this genuinely built through
   BuildKit from the Dockerfile this time. No change.
4. **Changed the service's region** (dashboard, `sfo` → a different
   region) — no change; a `/diag` page that had briefly worked on one
   Railway deploy started looping too on the next.

**Decisive evidence this isn't application code:** checked
`vidyayati-app-fresh`, a completely unrelated Railway service in a
different project on the same account (from the *original* Vidyayati
repo, deployed a day earlier, never touched by anything in this session)
— it shows the identical `/signin` → 307-self-redirect pattern. Two
services, two projects, two domains, both on `sfo`: this is a Railway
account/region-level issue, not a bug in this codebase. (A fifth test —
whether `next/font/google` in the root layout was implicated — was queued
but never got real traffic before the decision below was made; the
change was reverted untested, see the cleanup entry below.)

Also confirmed directly: this sandbox's network egress policy blocks
`*.up.railway.app` and `api.render.com` entirely (`403` at the proxy),
for every tool including a real headless Chromium via Playwright — so
none of this could be verified by fetching the URL directly from here;
every test relied on Railway's own logs plus you reloading the page.

**Decision (yours): move off Railway entirely.** Postgres stays
provisioned on Railway for now but the app won't be re-deployed there.
Fresh deployment target: **Render**, both the app and a new Render
Postgres (free tier — you were told and acknowledged it auto-deletes
after 30 days; revisit before then).

**Cleanup done same day:** removed the `[page-debug]` /
`[middleware-debug]` / `[layout-debug]` console.log statements, deleted
the temporary `/diag` page, and reverted the untested `next/font/google`
removal (restored Fraunces/Plus Jakarta Sans/IBM Plex Mono — the
approved design system per `claude.md`). `AUTH_URL` and the restored
`Cache-Control: no-store` header stay in the codebase either way — both
are correct, documented NextAuth/self-hosting practice regardless of
which platform ends up running this.

**Revised same day: target changed again, to Vercel + Neon.** Asked for
other Railway alternatives; recommended Vercel as the platform built by
the Next.js team (removes the whole category of "generic reverse proxy
mishandles App Router streaming" risk this project hit on Railway) —
you agreed. You also asked to close the Railway project entirely; the
`delete-service` MCP tool timed out repeatedly (same pattern as the
TCP-proxy removal on 2026-09-18) so this is left for you to do from the
Railway dashboard directly (Settings → Delete Project).

Confirmed neither Render's nor Vercel's/Neon's APIs are reachable from
this sandbox either (same `403` policy denial as Railway's own domain),
and no MCP tool exists for any of them — every step from here needs you
to act in their dashboards and relay back what happens, the same as the
final Railway browser checks.

**Prep done for Vercel:** added a `vercel-build` script to
`package.json` (`npx prisma generate && bash scripts/migrate.sh && next
build`) — Vercel runs this in place of a plain `next build` automatically
when present, so migrations and the bootstrap-admin step happen during
every build, the same role `scripts/migrate.sh` already plays as a
pre-deploy step on every other host. Verified locally as far as possible
without a real database (generate succeeds, migrate.sh correctly attempts
the connection, `next build` alone already builds clean — the full chain
already proved itself against a real Postgres on Railway). Rewrote
`Deployment.md` with Vercel as the recommended option and an honest
account of what happened on Railway instead of presenting it as
zero-setup.

**Live.** You provisioned Neon (project "Vidyayati", `production` branch,
pooled connection string, `ap-southeast-2`) and a Vercel project from the
GitHub repo, set `DATABASE_URL`/`AUTH_SECRET`/`BOOTSTRAP_ADMIN_USERNAME`/
`BOOTSTRAP_ADMIN_NAME`/`BOOTSTRAP_ADMIN_EMAIL` (AWS S3 vars left blank —
still deferred), deployed, then added `AUTH_URL` and redeployed once the
domain was known. Both builds succeeded: the first applied all 67
migrations and bootstrapped the Super Admin (`vidyayati-admin`) via
`vercel-build`, exactly as designed; the `channel_binding=require` Neon
connection-string parameter some Prisma versions choke on was not an
issue here. Live at **https://vidyayati-version2.vercel.app**. This
sandbox still can't reach `*.vercel.app` to verify directly (same egress
policy as Railway/Render), so this is taken on your build-log report,
which showed no errors.

**Open items:** AWS S3 (file uploads — photos, certificates, documents,
ID cards — will error until `AWS_S3_BUCKET`/`AWS_REGION`/
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are set); the one-time
`/setup-account` link for `vidyayati-admin` still needs to be visited to
set a real password. `Deployment.md` §4 Option A (Vercel) reflects the
process that was actually used, end to end.

---

## 2026-09-24 — QA fix pass begins: fee instalments (blocker 1.1)

A full QA pass was run against the live app as School Admin on a test
tenant ("Nayan international"), producing a ~50-item fix list grouped into
9 priorities (blockers, data-correctness bugs, validation, safety/UX,
missing modules, security, audit log, plus test-data cleanup and a
definition of done). Working through it in the given priority order, one
issue group per commit, starting with the first blocker.

**1.1 — Fees: no instalments were ever created, so fees couldn't be
collected.** Root cause: Academic Management → Fee Structure only ever
wrote `ClassFeeDefault.actualFee` (the display total); `FeeStructure`, the
model `recordPayment` actually reads from, was never populated by
anything in the app — every student showed Due ₹0 regardless of what was
set. `FeeStructure.amount` was also class-wide, so it would have ignored
each student's own chargedFee/scholarship even once populated.

Fix (commit `9d84b8e`): added a `FeeInstalment` model — one row per
student per term, generated from a class's `FeeStructure` plan and that
student's chargedFee (falling back to the grade's actualFee), split
proportionally across each head's terms. `FeePayment` now links to
`FeeInstalment` instead of the class-wide `FeeStructure`; a hand-written
migration backfills an instalment for any pre-existing `FeePayment` so no
payment history is lost. `FeeStructure` gained a `head` field (default
"Tuition") so Transport/Hostel fees can be added as their own head, billed
flatly to students with a matching assignment. The Fee Structure screen
now lets the admin define an instalment plan (term/amount/due date) per
grade, applied across every section in that grade, with a "Save & generate
instalments" action that reports how many instalments were created/updated
and flags students skipped because they already have payments against a
changed amount — it never overwrites a paid instalment. Admitting a
student (either admit path) and editing a student's charged fee now
generate/refresh that student's instalments immediately. Reports' Fee
Collection % and the fee/report-builder CSV exports were repointed at
`FeeInstalment`/`FeePayment` instead of the old class-wide amount. Both
`FeeStructure` and `FeeInstalment` were added to the audit log's
`AUDITED_MODELS`.

**Verification done:** `npx prisma validate`, `npx tsc --noEmit`,
`npx next lint`, and `npx next build` all pass. **Not verified against a
real database** — this sandbox's `.env` has an empty `DATABASE_URL` (no
DB reachable from here at all, cloud-only per this project's own design),
so the migration SQL was hand-written to match this project's existing
migration conventions rather than generated via `prisma migrate dev`, and
will apply the same way every other migration here does — via
`scripts/migrate.sh` on the next deploy. You should run through this
fix's "how to verify" steps (in the QA prompt, §1.1) against a real
deploy before trusting it fully.

**1.2 — Payroll: a same-month re-run overwrote the payslip but duplicated
the Accounts entry.** Root cause: both `runPayroll` and
`runStructuredPayroll` correctly upserted `PayrollRun` (unique on
staffId+month) but always `create`d a new `AccountsTransaction` — a
second run for the same month left the payslip correct but the ledger
holding both the old and new amounts, permanently disagreeing.

Fix (commit `6f0a647`): `AccountsTransaction` gained a unique
`payrollRunId`; both payroll actions now run an interactive transaction
that upserts the Accounts row keyed by the run's id, so a re-run edits
the one linked ledger row instead of adding a second. `StaffDetailTabs`
shows an inline confirmation (old amount → new amount, no
`window.confirm`) before overwriting an existing month's payslip. The
migration links each existing AUTO_PAYROLL row to its `PayrollRun` by
matching description, leaving true duplicates (like the QA test tenant's
"QA Maths Teacher" September double-pay) unlinked rather than deleting
them; `scripts/dedupe-payroll-accounts.ts` (dry-run by default, `--apply`
to delete) is the one-off cleanup for those, meant to be run once after
this migration deploys.

Remaining: 1.3 (admissions loses enquiry data, no real application
stage), 1.4 (students/employees can't be edited after saving), then
Priorities 2–5.
