// Creates the very first Super Admin account on a brand-new deployment.
// There is no seed data in this project (see memory.md) — a fresh database
// has zero users, so something has to create the first one. This script is
// that something: run it once, manually, after the first successful
// `prisma migrate deploy` (see Deployment.md).
//
// Idempotent and safe to re-run: it does nothing if a Super Admin already
// exists. Reads BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_NAME /
// BOOTSTRAP_ADMIN_EMAIL from the environment (set them once in the
// hosting platform's secrets, never commit them) and prints a one-time
// setup link — the same setupTokenHash mechanism every other account in
// this app already uses (lib/account-setup.ts). No password is ever
// hardcoded or seeded.
import { PrismaClient } from "@prisma/client";
import { createPendingAccount } from "../lib/account-setup";

const db = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — set it before running this script.`);
  }
  return value;
}

async function main() {
  const existing = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (existing) {
    console.log(`A Super Admin account already exists (username: ${existing.username}). Nothing to do.`);
    return;
  }

  const username = requireEnv("BOOTSTRAP_ADMIN_USERNAME").trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Super Admin";
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined;

  const { setupTokenHash, setupTokenExpiresAt, placeholderHash, token } = await createPendingAccount();

  const user = await db.user.create({
    data: {
      name,
      username,
      email,
      role: "SUPER_ADMIN",
      passwordHash: placeholderHash,
      setupTokenHash,
      setupTokenExpiresAt,
      mustChangePassword: true,
    },
  });

  console.log("Created the first Super Admin account.");
  console.log(`  username: ${user.username}`);
  console.log("  One-time setup link (visit this once to set a password — it will not be shown again):");
  console.log(`  /setup-account?token=${token}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
