"use client";

import { useEffect } from "react";

// QA fix 4.4: nothing in this app ever showed anything but the raw
// Next.js "An error occurred in the Server Components render..." message
// when a server action or Server Component threw — there was no error
// boundary anywhere. This is the app-wide catch-all; details go to the
// console (server-side in dev, browser console here) rather than the
// screen.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--paper)" }}>
      <div className="card" style={{ maxWidth: 440, padding: 32, textAlign: "center" }}>
        <div className="disp" style={{ fontSize: 19, marginBottom: 8 }}>
          Something went wrong
        </div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20 }}>Couldn&apos;t complete that. Please try again — if it keeps happening, contact support.</p>
        <button
          type="button"
          onClick={reset}
          style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
