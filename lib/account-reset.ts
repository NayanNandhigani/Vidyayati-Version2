import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// The "account is locked out, reset it over the phone" escape hatch —
// deliberately a fixed, readable-out-loud password rather than a
// random/one-time link (contrast lib/account-setup.ts, which exists
// specifically to avoid a fixed default on account *creation*). Safe
// because every reset also sets mustChangePassword: true — middleware.ts
// traps the session on the change-password route until a real password
// is set, so this only ever works for the single login right after a
// reset. A plain module (not a "use server" file) so it can be imported
// as a value from multiple server actions — see 4d1fc9a for why
// exporting it directly from a "use server" file broke the build.
export const RESET_PASSWORD_DEFAULT = "123456";

export async function resetPasswordToDefault(userId: string): Promise<void> {
  const passwordHash = await bcrypt.hash(RESET_PASSWORD_DEFAULT, 10);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true, setupTokenHash: null, setupTokenExpiresAt: null },
  });
}
