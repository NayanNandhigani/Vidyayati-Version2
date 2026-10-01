import { Prisma } from "@prisma/client";

// How server actions report problems to the person using the form.
//
// Next.js replaces the message of any error *thrown* by a server action
// with "An error occurred in the Server Components render…" in
// production, so a thrown business-rule error ("this bus is full") never
// reaches the user. Actions therefore *return* expected problems as
// { error } (plus optional per-field messages), and wrap their body in
// runAction() so anything unexpected is logged on the server and turned
// into a plain message instead of a raw one.

export type ActionError = { ok?: false; error: string; fieldErrors?: Record<string, string> };
export type ActionResult<T extends object = object> = ({ ok: true; error?: undefined; fieldErrors?: undefined } & T) | ActionError;

/** An expected, user-facing problem (validation, a business rule). Throw it from deep inside an action; runAction() turns it into { error }. */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "UserError";
  }
}

export const GENERIC_ERROR = "Something went wrong and your change wasn't saved. Please try again. If it keeps happening, contact Vidya Yati support.";

/** Turns an error into the message to show: a UserError's own text, a readable line for well-known database errors, or the generic message (after logging the real error). */
export function toActionError(err: unknown, context?: string): ActionError {
  if (err instanceof UserError) return { error: err.message, fieldErrors: err.fieldErrors };
  // redirect()/notFound() work by throwing; they must keep propagating.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test((err as { digest: string }).digest)) throw err;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return { error: "That would create a duplicate of an existing record. Please change the value and try again." };
    if (err.code === "P2025") return { error: "This record no longer exists. It may have been deleted. Please refresh the page." };
    if (err.code === "P2003") return { error: "This record is still linked to other records, so it can't be changed this way." };
  }
  console.error(`[action error]${context ? ` ${context}` : ""}`, err);
  return { error: GENERIC_ERROR };
}

export type ActionDone<R> = (R extends object ? Omit<R, "error" | "ok"> : unknown) & { ok: true; error?: undefined; fieldErrors?: undefined };

/** Runs an action body, converting thrown errors into { error } results (see toActionError). A body that itself returns { error: "…" } is passed through as an error result. */
export async function runAction<R>(fn: () => Promise<R>, context?: string): Promise<ActionDone<R> | ActionError> {
  try {
    const result = await fn();
    if (result && typeof result === "object" && "error" in result && typeof (result as { error?: unknown }).error === "string") return result as unknown as ActionError;
    return { ...(result && typeof result === "object" ? result : {}), ok: true } as ActionDone<R>;
  } catch (err) {
    return toActionError(err, context);
  }
}
