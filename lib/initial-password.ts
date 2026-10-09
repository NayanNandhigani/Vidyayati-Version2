import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { INITIAL_PASSWORD } from "./initial-password-value";

export { INITIAL_PASSWORD, passwordStatus, type PasswordStatus } from "./initial-password-value";

// Every new portal account (School Admin, staff, parent, platform staff)
// starts on this password. While the account still has it
// (usesInitialPassword), the admin who manages the account can see it to
// share it, and the user is made to choose their own the first time they
// sign in (middleware + the change-password popup). An admin can reset an
// account back to it at any time. The password itself is only ever stored
// hashed — admins "see" it because it is this known value, not because it
// is readable from the database.

/** Fields for a new User row: the initial password, flagged, change required. */
export async function initialPasswordFields() {
  return {
    passwordHash: await bcrypt.hash(INITIAL_PASSWORD, 10),
    usesInitialPassword: true,
    mustChangePassword: true,
    setupTokenHash: null,
    setupTokenExpiresAt: null,
  };
}

/** Puts an existing account back on the initial password (admin "Reset password"). */
export async function resetToInitialPassword(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: await initialPasswordFields() });
}

/** Fields to store when a user sets their own password. */
export async function ownPasswordFields(newPassword: string) {
  return {
    passwordHash: await bcrypt.hash(newPassword, 10),
    usesInitialPassword: false,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    setupTokenHash: null,
    setupTokenExpiresAt: null,
  };
}
