# Deployment — Vidyayati 2.0

Step-by-step instructions to take this project from a fresh clone to a
live, working deployment. Written so anyone can follow it, not just this
session. This project is **cloud-only** — there is no local-database mode,
so even "running it locally" in step 5 below talks to a real cloud
database.

Pick one option in each of steps 1, 2, and 4; steps 3, 5, 6, 7 are the same
regardless of which you pick.

## 1. Provision a Postgres database

The app only needs a standard `DATABASE_URL` connection string — pick
whichever of these is most convenient:

### Option A — Neon (recommended: free tier, instant per-branch databases, pairs with Vercel below)

1. Create an account at neon.tech, create a project.
2. Copy the connection string it gives you (starts `postgresql://`) —
   this is your `DATABASE_URL`. Use the **pooled** connection string for
   the app itself; migrations (step 3) should use the **direct**
   (non-pooled) connection string if Neon gives you both.
3. Optional but recommended: create a separate branch (Neon's branching
   feature) per environment (`production`, `staging`, and one per PR if
   you want preview environments) — each branch has its own
   `DATABASE_URL`.

### Option B — Railway Postgres

1. In a Railway project, add a "PostgreSQL" service.
2. Railway generates `DATABASE_URL` automatically and injects it into any
   other service in the same project as an environment variable
   reference — nothing to copy by hand if the app is also hosted on
   Railway (see step 4, Option A).

### Option C — Supabase

1. Create a project at supabase.com.
2. Project Settings → Database → Connection string → copy the URI
   (use the "Transaction" pooler string for the app; direct connection for
   migrations if you hit pooler issues running `prisma migrate deploy`).
3. Supabase also offers object storage — only relevant here if you'd
   rather not use AWS S3 (this project defaults to S3, see step 2C).

## 2. Provision file storage (AWS S3)

1. Create an S3 bucket (any region — set `AWS_REGION` to match).
2. Create an IAM user (or role) with `s3:PutObject`, `s3:GetObject`,
   `s3:DeleteObject` scoped to that bucket, and generate an access key.
3. Set `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`.
4. The bucket can stay fully private — every file is served back through
   this app's own authenticated API routes (`app/api/*-assets`,
   `app/api/documents`, etc.), never a direct public S3 URL.

If you'd rather use an S3-compatible provider (Cloudflare R2, or MinIO for
local testing) instead of AWS S3 itself, set `S3_ENDPOINT` to that
provider's endpoint URL — everything else about `lib/storage.ts` works
unchanged.

## 3. Set environment variables

Wherever the app runs (your hosting platform's secrets/variables panel, or
a local `.env` copied from `.env.example`):

| Variable | From |
|---|---|
| `DATABASE_URL` | Step 1 |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | The app's exact public HTTPS URL (e.g. the domain from step 4) — **required**, not optional; see below |
| `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Step 2 |
| `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` | Your choice — used once, in step 6 |

Never commit `.env`.

**On `AUTH_URL`:** you won't know the app's domain until step 4/5 provisions
one, so it's normal to deploy once, generate the domain, then come back
and set `AUTH_URL` to that exact URL and redeploy. Skipping this step is
the single most likely cause of a production sign-in page that redirects
to itself in a loop — `trustHost: true` (already set in `auth.config.ts`)
is not a full substitute for it behind every reverse proxy.

## 4. Choose app hosting

### Option A — Vercel (recommended: built by the Next.js team, no App-Router edge-case risk)

Vercel doesn't run the `Dockerfile` — it builds directly from the repo
using its own Next.js-aware build system, which is the safest choice for
this app specifically: every generic Docker host puts a reverse proxy of
its own in front of the container, and Next.js App Router's streamed
page responses (RSC payloads) are a well-known source of proxy-specific
edge cases on hosts not built around Next.js (see `memory.md`'s
2026-09-20 entry — this project hit exactly that on Railway, across two
independent services, never resolved). Vercel has none of that risk.

1. **New Project** → import the GitHub repo, branch
   `claude/vidyayati-2-saas-rebuild-peufo9` (or `main` once merged).
   Framework preset: Next.js (auto-detected).
2. Add the environment variables from step 3 in **Project Settings →
   Environment Variables** (Production, and Preview too if you want PR
   previews).
3. Migrations run automatically as part of the build: `package.json`'s
   `vercel-build` script (`npx prisma generate && bash scripts/migrate.sh
   && next build`) is what Vercel runs instead of a plain `next build` —
   it applies every pending migration, then (if
   `BOOTSTRAP_ADMIN_USERNAME` is set) bootstraps the first Super Admin,
   before the app itself builds. Read the one-time setup link from the
   **build** logs (not deploy/runtime logs) in the Vercel dashboard.
4. Deploy. Vercel gives you a `*.vercel.app` domain immediately — set
   `AUTH_URL` to it and redeploy (**Deployments → ⋯ → Redeploy**), per
   the `AUTH_URL` note in step 3 above.
5. `/api/health` still exists and works the same way, but Vercel doesn't
   use it as a deploy gate (no configurable healthcheck path — a failed
   build simply doesn't promote).

### Option B — Railway

The app ships a standard multi-stage `Dockerfile` and a `railway.json`
that wires up `scripts/migrate.sh` as a pre-deploy step and
`/api/health` as the healthcheck — in principle this is the least setup
of any option. In practice, this project's own deploy to Railway hit an
unresolved production-only issue (every page, not just this app's,
self-redirected in a loop — confirmed across two unrelated services on
the same account; see `memory.md`, 2026-09-18/20 entries) that four
different fixes didn't resolve. Try it if you like, but Vercel is the
better-tested path for this specific app.

### Option C — Render

1. New → Web Service → connect the repo → Environment: **Docker**.
2. **Advanced → Pre-Deploy Command**: `bash scripts/migrate.sh` — Render
   runs this before each deploy takes traffic, same idea as Railway's
   `preDeployCommand`. (If your plan doesn't expose that field, run
   `npx prisma migrate deploy` — and `npm run bootstrap-admin` the first
   time — from Render's **Shell** tab instead, once per schema change.)
3. Add the environment variables from step 3.
4. Render's free Postgres (if you provision one instead of Neon/Supabase)
   **auto-deletes after 30 days** — fine for testing, not for anything
   you want to keep without upgrading to a paid plan first.

### Option D — Fly.io

1. `fly launch` (detects the `Dockerfile`) → `fly deploy`.
2. Add a `release_command = "bash scripts/migrate.sh"` under `[deploy]`
   in `fly.toml` — Fly runs this automatically before each new version
   takes traffic, equivalent to Railway's `preDeployCommand`.
3. `fly secrets set` for every variable in step 3.

## 5. First deploy

1. Push this repo to your git remote; connect it to the host from step 4.
2. Let the first deploy run — it builds the Docker image, runs
   `prisma migrate deploy` against `DATABASE_URL` (applying every
   migration in `prisma/migrations/` to the fresh database), then starts
   the app.
3. Confirm `/api/health` returns healthy.

## 6. Bootstrap the first Super Admin account

There is no seed data — a freshly migrated database has zero users. If
`BOOTSTRAP_ADMIN_USERNAME` was set in step 3, this is already handled:
`scripts/migrate.sh` calls `npm run bootstrap-admin` automatically after
migrations — it no-ops once a Super Admin exists, so it's safe to leave
the variable set permanently. Every option in step 4 runs this script one
way or another (Vercel: inside the `vercel-build` build step; the others:
as an explicit pre-deploy command). Read the one-time setup link from
wherever that host puts those logs (Vercel: the **build** logs, not
deploy/runtime; Railway: the deploy logs tab; Fly: `fly logs`; Render:
the deploy's log tab):

```
Created the first Super Admin account.
  username: <BOOTSTRAP_ADMIN_USERNAME>
  One-time setup link (visit this once to set a password — it will not be shown again):
  /setup-account?token=<...>
```

Visit `https://<your-domain>/setup-account?token=<...>` once to set a real
password. The link cannot be regenerated — if it expires (7 days) or is
lost before use, an existing Super Admin can create a new one from inside
the app instead (Super Admin → Staff), which issues its own one-time link
the same way.

If you're not on Vercel and your host doesn't support a pre-deploy step
(or you'd rather not rely on it), run it by hand once instead, from
anywhere with `DATABASE_URL` and the `BOOTSTRAP_ADMIN_*` variables set
(Railway: `railway run npm run bootstrap-admin`; Fly: `fly ssh console` +
run it; Render: the shell tab):

```bash
npm run bootstrap-admin
```

Every other account (School Admins, Staff, Parents) is created the same
way, from inside the app by a Super Admin or School Admin — never seeded.

## 7. CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:
install → `npm run lint` → `npm run typecheck` → `npm run build` (which
also validates the Prisma schema via `prisma generate`). A red run blocks
merging. Deployment itself is triggered by your host's own GitHub
integration (all four options in step 4 support "deploy on push to
`main`" natively) — CI doesn't deploy anything itself, it's the gate
before a deploy is allowed to happen.

## 8. Running the production image locally (optional)

To verify the exact image that will run in production, against a real
cloud database, without touching your hosting platform:

```bash
cp .env.example .env   # fill in DATABASE_URL (a dev-tier cloud DB), AUTH_SECRET, S3 vars
docker compose up --build
```

See `docker-compose.yml` — it builds the same `Dockerfile` used in
production and runs it with your `.env`, but does **not** run migrations
automatically (run `npx prisma migrate deploy` once against your dev
database first, same as any other environment).

## Environments

A recommended split, once the above works once:

- **Production** — its own database (any provider from step 1), its own
  S3 bucket or prefix, deployed from `main`.
- **Staging** — a second database/bucket, deployed from a `staging`
  branch, for trying changes before production.
- **Preview** (optional, easiest with Neon's branching + Railway's or
  Vercel's PR-preview features) — a throwaway database branch per pull
  request, torn down when the PR closes.
