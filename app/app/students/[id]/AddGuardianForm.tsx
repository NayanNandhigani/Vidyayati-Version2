"use client";

import { useState, useTransition } from "react";
import type { ParentRelation } from "@prisma/client";
import { addGuardianToStudent } from "../depth-actions";
import InitialLoginNotice from "@/components/InitialLoginNotice";

export default function AddGuardianForm({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<ParentRelation>("GUARDIAN");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newLogin, setNewLogin] = useState<{ username: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await addGuardianToStudent(studentId, { name, relation, phone, email });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      if (res.loginUsername) setNewLogin({ username: res.loginUsername, name });
      setName("");
      setPhone("");
      setEmail("");
      if (!res.loginUsername) setOpen(false);
    });
  }

  if (newLogin) {
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <InitialLoginNotice name={newLogin.name} username={newLogin.username} />
        <span onClick={() => { setNewLogin(null); setOpen(false); }} style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-deep)", cursor: "pointer" }}>
          Done
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <span onClick={() => setOpen(true)} style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 700, color: "var(--marigold-deep)", cursor: "pointer" }}>
        + Add guardian
      </span>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, background: "var(--paper)", borderRadius: 8, padding: 12 }}>
      <div className="m-1col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input className="in" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 12 }} />
        <select className="in" value={relation} onChange={(e) => setRelation(e.target.value as ParentRelation)} style={{ fontSize: 12 }}>
          <option value="FATHER">Father</option>
          <option value="MOTHER">Mother</option>
          <option value="GUARDIAN">Guardian</option>
        </select>
        <input className="in mono" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ fontSize: 12 }} />
        <input className="in" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 12 }} />
      </div>
      {error && <div style={{ fontSize: 11.5, color: "var(--critical)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={save} disabled={pending || !name.trim() || !phone.trim()} style={{ fontSize: 11.5, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          {pending ? "Saving…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 11.5, fontWeight: 600, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
