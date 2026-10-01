// Client-side companion to runAction(): turns an { error } result back
// into a thrown Error *in the browser*, where its message isn't redacted,
// so existing try/catch blocks keep showing it.

export function unwrap<T extends { error?: string | undefined }>(result: T): Exclude<T, { ok?: false; error: string }> {
  if (result && typeof result.error === "string") throw new Error(result.error);
  return result as Exclude<T, { ok?: false; error: string }>;
}
