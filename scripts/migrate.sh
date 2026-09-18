#!/bin/sh
# Runs as the host's preDeployCommand — a one-off container from the same
# built image, executed once before a new deployment is promoted to take
# traffic. Applies any pending migrations against the live DATABASE_URL
# with `prisma migrate deploy` (the production-safe command — never
# `prisma migrate dev`, which can prompt interactively or reset data).
set -e

echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations applied."

# There is no seed data (see memory.md) — a freshly migrated database has
# zero users. If BOOTSTRAP_ADMIN_USERNAME is set, try to create the first
# Super Admin here too, so a fresh deploy is immediately usable without a
# separate manual step. Deliberately never fails the deploy: bootstrap-admin
# is idempotent (no-ops once a Super Admin exists) and this runs on every
# deploy, not just the first — `|| true` covers the var being unset (most
# deploys, once the first admin exists) and any other bootstrap failure.
if [ -n "$BOOTSTRAP_ADMIN_USERNAME" ]; then
  echo "Checking for a bootstrap Super Admin account..."
  npm run bootstrap-admin || true
fi
