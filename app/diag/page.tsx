// Temporary diagnostic page — no NextAuth/auth imports at all — to isolate
// whether the /signin production redirect loop is specific to that route
// or affects every App Router page on this deployment. Remove once the
// /signin loop is resolved (see memory.md).
export const dynamic = "force-dynamic";

export default function DiagPage() {
  console.log("[diag-debug] rendering /diag");
  return <p>diag-ok {new Date().toISOString()}</p>;
}
