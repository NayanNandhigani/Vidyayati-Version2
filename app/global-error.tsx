"use client";

// Last-resort boundary for errors in the root layout itself (app/error.tsx
// covers everything below it). Never shows the raw error text.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f5f0", margin: 0 }}>
        <div style={{ maxWidth: 460, margin: "15vh auto", padding: 24, background: "#fff", borderRadius: 12, border: "1px solid #e6e1d6" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "0 0 16px" }}>This page couldn&apos;t be loaded. Please try again. If it keeps happening, contact Vidya Yati support.</p>
          <button onClick={reset} style={{ background: "#e08a2c", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
