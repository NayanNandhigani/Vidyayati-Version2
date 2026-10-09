import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { INITIAL_PASSWORD, passwordStatus } from "@/lib/initial-password-value";
import { newPasswordSchema } from "@/lib/validation";

describe("password workflow", () => {
  it("starts accounts on 12345", () => {
    expect(INITIAL_PASSWORD).toBe("12345");
  });
  it("shows the initial password only while the account still uses it", () => {
    expect(passwordStatus({ usesInitialPassword: true, passwordChangedAt: null })).toEqual({ initial: true, password: "12345" });
    const changed = new Date("2026-10-09T08:00:00Z");
    expect(passwordStatus({ usesInitialPassword: false, passwordChangedAt: changed })).toEqual({ initial: false, changedAt: changed.toISOString() });
  });
  it("won't let anyone keep 12345 as their own password", () => {
    expect(newPasswordSchema.safeParse({ newPassword: INITIAL_PASSWORD, username: "nayan" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ newPassword: "Sunrise#2026", username: "nayan" }).success).toBe(true);
  });
  it("stores the initial password hashed, never as plain text", async () => {
    const { initialPasswordFields } = await import("@/lib/initial-password");
    const f = await initialPasswordFields();
    expect(f.passwordHash).not.toContain(INITIAL_PASSWORD);
    expect(await bcrypt.compare(INITIAL_PASSWORD, f.passwordHash)).toBe(true);
    expect(f).toMatchObject({ usesInitialPassword: true, mustChangePassword: true, setupTokenHash: null });
  });
});
