import { cookies } from "next/headers";

const COOKIE_NAME = "setup_token_flash";

/**
 * QA fix 6 (Security): a freshly created account's one-time setup token
 * used to travel as a `?setupToken=...` query param on the post-create
 * redirect, landing in browser history and server access logs. Call this
 * from the creating Server Action right before redirect()ing to the new
 * record's page (no query param needed), then readSetupTokenFlash() once
 * from that page to show it inline (see SetupLinkBanner). httpOnly so no
 * client script can read it either; a short maxAge closes the exposure
 * window since Server Components can't clear a cookie themselves (only a
 * Server Action/Route Handler can) — there's no way to make it truly
 * single-read without a database round trip, and a plain in-memory
 * per-user flag can't be created any faster than this from here.
 */
export async function setSetupTokenFlash(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60, path: "/" });
}

export async function readSetupTokenFlash(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}
