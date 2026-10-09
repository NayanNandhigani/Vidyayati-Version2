import { INITIAL_PASSWORD } from "@/lib/initial-password-value";

// Shown to the admin right after a login is created or reset: the details to
// hand over. The person must choose their own password the first time they
// sign in.
export default function InitialLoginNotice({ name, username, reset }: { name?: string | null; username: string; reset?: boolean }) {
  return (
    <div role="status" style={{ background: "var(--good-tint)", border: "1px solid var(--good)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
      <div style={{ fontWeight: 700, color: "var(--good)" }}>
        {reset ? "Password reset" : "Login created"}
        {name ? ` for ${name}` : ""} — share these details
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span>
          Username <strong className="mono">{username}</strong>
        </span>
        <span>
          Password <strong className="mono">{INITIAL_PASSWORD}</strong>
        </span>
      </div>
      <div style={{ color: "var(--muted)" }}>They&apos;ll be asked to choose their own password the first time they sign in.</div>
    </div>
  );
}
