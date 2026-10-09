// The initial password and how an admin sees an account's password — plain
// values with no server imports, so browser components can use them too.
// The hashing and database side lives in lib/initial-password.ts.
export const INITIAL_PASSWORD = "12345";

/** What an admin sees about an account's password. */
export type PasswordStatus = { initial: true; password: string } | { initial: false; changedAt: string | null };

export function passwordStatus(user: { usesInitialPassword: boolean; passwordChangedAt: Date | null }): PasswordStatus {
  return user.usesInitialPassword ? { initial: true, password: INITIAL_PASSWORD } : { initial: false, changedAt: user.passwordChangedAt?.toISOString() ?? null };
}
