import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";

export const SETUP_TOKEN_TTL_DAYS = 7;

// One-time setup links (/setup-account?token=…). Portal accounts now start
// on the initial password instead (lib/initial-password.ts); a setup link
// is only used for the very first Super Admin on a fresh deployment
// (scripts/bootstrap-admin.ts), so the most powerful account never has a
// guessable password. Links already handed out keep working until expiry.

/**
 * A login nobody can use yet: an unusable random password hash plus a
 * one-time setup token (store only its hash; show the raw token once).
 */
export async function createPendingAccount() {
  const token = randomBytes(32).toString("hex");
  const setupTokenHash = hashSetupToken(token);
  const setupTokenExpiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const placeholderHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  return { token, setupTokenHash, setupTokenExpiresAt, placeholderHash };
}

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
