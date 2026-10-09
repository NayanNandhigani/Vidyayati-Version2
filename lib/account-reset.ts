// Kept for existing imports: an admin reset now puts the account back on
// the initial password (lib/initial-password.ts).
import { INITIAL_PASSWORD, resetToInitialPassword } from "@/lib/initial-password";

export const RESET_PASSWORD_DEFAULT = INITIAL_PASSWORD;

export async function resetPasswordToDefault(userId: string): Promise<void> {
  await resetToInitialPassword(userId);
}
