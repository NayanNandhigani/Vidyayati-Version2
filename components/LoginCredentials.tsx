"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_PASSWORD, type PasswordStatus } from "@/lib/initial-password-value";
import { formatIST } from "@/lib/ist";
import { friendlyError } from "@/lib/friendly-error";

// An account's login as its admin sees it: the username, and either the
// initial password (until the person sets their own — then it's hidden for
// good) or when they last changed it, with a button to put the account back
// on the initial password.
export default function LoginCredentials({
  username,
  status,
  onReset,
  title = "Login",
}: {
  username: string;
  status: PasswordStatus;
  onReset?: () => Promise<{ error?: string } | void>;
  title?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    if (!onReset) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    start(async () => {
      try {
        const res = await onReset();
        if (res && res.error) setError(res.error);
        else router.refresh();
      } catch (err) {
        setError(friendlyError(err));
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>
        {title}
      </div>
      <div className="m-1col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Username</div>
          <div className="mono" style={{ fontSize: 13.5, fontWeight: 700 }}>
            {username}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Password</div>
          {status.initial ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 13.5, fontWeight: 700 }}>
                {status.password}
              </span>
              <span className="pill" style={{ background: "var(--warn-tint)", color: "var(--warn)", fontSize: 10.5 }}>
                Temporary — not changed yet
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13 }}>
              Set by them{status.changedAt ? ` on ${formatIST(status.changedAt, { day: "2-digit", month: "short", year: "numeric" })}` : ""}
            </div>
          )}
        </div>
      </div>
      {status.initial ? (
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>They&apos;ll be asked to choose their own password the first time they sign in. After that, it&apos;s hidden here.</div>
      ) : (
        onReset && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              style={{ background: confirming ? "var(--critical)" : "var(--card)", color: confirming ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {pending ? "Resetting…" : confirming ? `Confirm: reset to ${INITIAL_PASSWORD}` : `Reset password to ${INITIAL_PASSWORD}`}
            </button>
            {confirming && (
              <span onClick={() => setConfirming(false)} style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                Cancel
              </span>
            )}
          </div>
        )
      )}
      {error && <div style={{ fontSize: 12, color: "var(--critical)" }}>{error}</div>}
    </div>
  );
}
