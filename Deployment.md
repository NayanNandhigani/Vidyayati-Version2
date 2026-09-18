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

### Option A — Neon (recommended: free tier, instant per-branch databases)

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
| `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Step 2 |
| `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` | Your choice — used once, in step 6 |

Never commit `.env`.

## 4. Choose app hosting

The app ships as a standard multi-stage `Dockerfile` — any host that runs
a Docker image and lets you run one pre-deploy command (for migrations)
works.

### Option A — Railway (recommended: least setup, matches `railway.json`)

1. New project → deploy from the GitHub repo. Railway reads
   `railway.json` automatically: it builds via the `Dockerfile`, runs
   `scripts/migrate.sh` (`prisma migrate deploy`) as a pre-deploy step
   before every release, and health-checks `/api/health`.
2. Add the environment variables from step 3 to the service.
3. Generate a domain (Railway → Settings → Networking → Generate Domain),
   or attach a custom one.

### Option B — Render

1. New → Web Service → connect the repo → Environment: **Docker**.
2. Render doesn't have a native "pre-deploy command" the way Railway
   does — either (a) add `RUN` of the migrate step isn't safe (it would
   run at build time, before secrets are available), so instead add a
   Render "Job" (or a `postStart` hook) that runs
   `npx prisma migrate deploy` once per deploy before traffic shifts, or
   (b) run it manually via Render's shell after each deploy that changes
   the schema.
3. Add the environment variables from step 3.

### Option C — Fly.io

1. `fly launch` (detects the `Dockerfile`) → `fly deploy`.
2. Add a `release_command = "npx prisma migrate deploy"` under `[deploy]`
   in `fly.toml` — Fly runs this automatically before each new version
   takes traffic, equivalent to Railway's `preDeployCommand`.
3. `fly secrets set` for every variable in step 3.

### Option D — Vercel

Vercel doesn't run arbitrary Docker images or pre-deploy shell commands
the way the others do, so it needs a workaround:
1. Deploy the Next.js app to Vercel normally (it builds directly from the
   repo, ignoring the `Dockerfile`).
2. Run `prisma migrate deploy` from CI (see step 7) *before* the Vercel
   deploy is promoted, since Vercel itself has no migration hook — e.g. a
   GitHub Actions step that runs migrations against `DATABASE_URL`, then
   triggers or waits for the Vercel deploy.
3. Add the environment variables from step 3 in the Vercel project
   settings.
4. Only use this option if you specifically want Vercel's edge network for
   the Next.js app — Railway/Render/Fly are simpler for this project since
   the Dockerfile already does the right thing.

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
`scripts/migrate.sh` (the pre-deploy step every option in step 4 already
runs) calls `npm run bootstrap-admin` automatically after migrations, on
every deploy — it no-ops once a Super Admin exists, so it's safe to leave
the variable set permanently. Read the one-time setup link from that
deploy's logs (Railway: the deploy logs tab; Fly:
`fly logs`; Render: the deploy's log tab):

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

If your host doesn't support a pre-deploy step (or you'd rather not rely
on it), run it by hand once instead, from anywhere with `DATABASE_URL`
and the `BOOTSTRAP_ADMIN_*` variables set (Railway: `railway run npm run
bootstrap-admin`; Fly: `fly ssh console` + run it; Render: the shell tab;
Vercel: run it from your own machine against the same `DATABASE_URL`,
since Vercel has no shell):

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
