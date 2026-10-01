// Browser-side safety net: turns any error that escaped a server action
// into text fit to show a person. Production builds replace a thrown
// server-action message with Next.js's own "An error occurred in the
// Server Components render…" text, which must never reach the screen.

const RAW_PATTERNS = [/Server Components render/i, /digest/i, /Unexpected token/i, /Failed to fetch/i, /NEXT_/, /prisma/i, /Invalid `/];

export function friendlyError(err: unknown, fallback = "Something went wrong and your change wasn't saved. Please try again."): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return fallback;
  if (/Failed to fetch|NetworkError|network/i.test(message)) return "Couldn't reach the server. Check your internet connection and try again.";
  if (RAW_PATTERNS.some((re) => re.test(message))) return fallback;
  return message;
}
