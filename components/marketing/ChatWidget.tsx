"use client";

import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const GREETING = "Hi! Ask me anything about Vidya Yati: modules, plans, security, or how parents and staff use it.";
const SUGGESTIONS = ["What modules do you have?", "How is our school's data kept separate?", "What's the difference between Standard and Premium?"];

// Floating chat bubble for the public homepage. Talks to /api/chat, which
// only knows the product facts in lib/chatbot/knowledge.ts.
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: question }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const setReply = (content: string) =>
      setTurns((prev) => {
        const next = prev.slice();
        next[next.length - 1] = { role: "assistant", content };
        return next;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        setReply((await res.text().catch(() => "")) || "Sorry, something went wrong. Please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setReply(reply);
      }
      if (!reply.trim()) setReply("Sorry, I didn't get a reply. Please try again.");
    } catch {
      setReply("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat with Vidya Yati"
          style={{
            position: "fixed",
            right: 20,
            bottom: 88,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(540px, calc(100dvh - 120px))",
            background: "#121829",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 60,
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>Ask Vidya Yati</div>
              <div style={{ fontSize: 11.5, color: "#7f8bb0" }}>AI assistant · answers can be wrong</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "none", border: "none", color: "#aeb8d6", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
              ×
            </button>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <Bubble role="assistant" content={GREETING} />
            {turns.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{ textAlign: "left", background: "rgba(224,138,44,0.1)", border: "1px solid rgba(224,138,44,0.35)", color: "#f3c98f", borderRadius: 10, padding: "8px 11px", fontSize: 12.5, cursor: "pointer" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <Bubble key={i} role={t.role} content={t.content || (busy && i === turns.length - 1 ? "…" : "")} />
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Type your question…"
              rows={1}
              maxLength={1000}
              aria-label="Your message"
              style={{ flex: 1, resize: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#e8ebf5", padding: "9px 11px", fontSize: 13.5, fontFamily: "inherit", maxHeight: 96 }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: busy || !input.trim() ? "default" : "pointer", opacity: busy || !input.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--marigold)",
          color: "#fff",
          border: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          fontSize: 24,
          cursor: "pointer",
          zIndex: 60,
        }}
      >
        {open ? "×" : "💬"}
      </button>
    </>
  );
}

function Bubble({ role, content }: Turn) {
  const mine = role === "user";
  return (
    <div
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: mine ? "var(--marigold)" : "rgba(255,255,255,0.06)",
        color: mine ? "#fff" : "#e8ebf5",
        borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
        padding: "8px 12px",
        fontSize: 13.5,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {content}
    </div>
  );
}
