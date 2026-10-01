"use client";

import { useEffect, useState } from "react";

// Minimal app-wide toasts for actions that have no form of their own to
// show a message next to (a button in a list row, an inline save). Call
// toast.error("…") / toast.success("…") from any client component.

type Toast = { id: number; kind: "error" | "success"; message: string };
const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

function emit(kind: Toast["kind"], message: string) {
  const t = { id: nextId++, kind, message };
  listeners.forEach((l) => l(t));
}

export const toast = {
  error: (message: string) => emit("error", message),
  success: (message: string) => emit("success", message),
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.kind === "error" ? 7000 : 3500);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" style={{ position: "fixed", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 1000, maxWidth: "min(420px, calc(100vw - 32px))" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          style={{
            background: t.kind === "error" ? "var(--critical-tint, #fdecec)" : "var(--good-tint, #e9f7ef)",
            color: t.kind === "error" ? "var(--critical, #b42318)" : "var(--good, #1f7a4d)",
            border: `1px solid ${t.kind === "error" ? "var(--critical-border, #f3b8b3)" : "var(--good-border, #b7e3c8)"}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            cursor: "pointer",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
