"use client";

import { useState, useTransition } from "react";
import { setClassFeeDefault, saveFeeInstalmentPlan, type FeeInstalmentPlanTerm } from "./actions";

type PlanRow = { head: string; term: string; amount: number; dueDate: string };
export type GradeFeeRow = { grade: string; sectionCount: number; actualFee: number | null; plan: PlanRow[] };

export default function FeeStructurePanel({ grades }: { grades: GradeFeeRow[] }) {
  return (
    <div>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>Fee Structure</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
        Set the actual fee for each class (grade) — shared by every section in it. This is what shows on a student's profile and prepopulates admission approval; a student's charged fee (and scholarship) is set individually per student. Below that, define the instalment plan (terms, amounts and due dates) that generates each student's actual fee instalments.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {grades.map((g) => (
          <GradeCard key={g.grade} gradeRow={g} />
        ))}
      </div>
    </div>
  );
}

function GradeCard({ gradeRow }: { gradeRow: GradeFeeRow }) {
  const [pending, startTransition] = useTransition();
  const [actualFee, setActualFee] = useState(gradeRow.actualFee != null ? String(gradeRow.actualFee) : "");
  const [saved, setSaved] = useState(false);

  function save() {
    const actual = Number(actualFee);
    if (!actualFee || Number.isNaN(actual) || actual < 0 || !Number.isInteger(actual)) return;
    startTransition(async () => {
      await setClassFeeDefault(gradeRow.grade, actual);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div style={{ background: "var(--paper)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr auto", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Class {gradeRow.grade}</div>
          <div style={{ fontSize: 10.5, color: "var(--faint)" }}>
            {gradeRow.sectionCount} section{gradeRow.sectionCount === 1 ? "" : "s"}
          </div>
        </div>
        <input className="in mono" type="number" min={0} step={1} value={actualFee} onChange={(e) => setActualFee(e.target.value)} placeholder="0" style={{ fontSize: 12.5 }} />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{ fontSize: 11.5, fontWeight: 700, background: saved ? "var(--good)" : "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 12px", cursor: pending ? "default" : "pointer" }}
        >
          {saved ? "Saved" : pending ? "Saving…" : "Save"}
        </button>
      </div>
      <InstalmentPlanEditor grade={gradeRow.grade} initialPlan={gradeRow.plan} />
    </div>
  );
}

function InstalmentPlanEditor({ grade, initialPlan }: { grade: string; initialPlan: PlanRow[] }) {
  const [pending, startTransition] = useTransition();
  const heads = Array.from(new Set(["Tuition", ...initialPlan.map((p) => p.head)]));
  const [head, setHead] = useState(heads[0] ?? "Tuition");
  const [terms, setTerms] = useState<FeeInstalmentPlanTerm[]>(() => {
    const forHead = initialPlan.filter((p) => p.head === (heads[0] ?? "Tuition"));
    return forHead.length > 0 ? forHead.map(({ term, amount, dueDate }) => ({ term, amount, dueDate })) : [{ term: "Term 1", amount: 0, dueDate: "" }];
  });
  const [result, setResult] = useState<{ instalmentsCreated: number; instalmentsUpdated: number; flagged: { studentId: string; studentName: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchHead(nextHead: string) {
    setHead(nextHead);
    const forHead = initialPlan.filter((p) => p.head === nextHead);
    setTerms(forHead.length > 0 ? forHead.map(({ term, amount, dueDate }) => ({ term, amount, dueDate })) : [{ term: "Term 1", amount: 0, dueDate: "" }]);
    setResult(null);
    setError(null);
  }

  function updateTerm(i: number, patch: Partial<FeeInstalmentPlanTerm>) {
    setTerms((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function addTerm() {
    setTerms((prev) => [...prev, { term: `Term ${prev.length + 1}`, amount: 0, dueDate: "" }]);
  }

  function removeTerm(i: number) {
    setTerms((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await saveFeeInstalmentPlan(grade, head, terms);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the instalment plan.");
      }
    });
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Instalment plan</div>
        <select
          value={head}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new__") {
              const custom = prompt("New fee head name (e.g. Admission, Exam):");
              if (custom && custom.trim()) switchHead(custom.trim());
              return;
            }
            switchHead(v);
          }}
          style={{ fontSize: 11.5, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--line)" }}
        >
          {["Tuition", "Transport", "Hostel", "Admission", "Exam", "Other", ...heads.filter((h) => !["Tuition", "Transport", "Hostel", "Admission", "Exam", "Other"].includes(h))].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
          <option value="__new__">+ New head…</option>
        </select>
        {(head === "Transport" || head === "Hostel") && (
          <span style={{ fontSize: 10.5, color: "var(--faint)" }}>Only billed to students with a {head.toLowerCase()} assignment.</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {terms.map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
            <input className="in" value={t.term} onChange={(e) => updateTerm(i, { term: e.target.value })} placeholder="Term name" style={{ fontSize: 12 }} />
            <input className="in mono" type="number" min={0} step={1} value={t.amount || ""} onChange={(e) => updateTerm(i, { amount: Number(e.target.value) })} placeholder="Amount ₹" style={{ fontSize: 12 }} />
            <input className="in mono" type="date" value={t.dueDate} onChange={(e) => updateTerm(i, { dueDate: e.target.value })} style={{ fontSize: 12 }} />
            <span onClick={() => removeTerm(i)} style={{ color: "var(--critical)", cursor: "pointer", fontSize: 12, fontWeight: 700, alignSelf: "center" }}>
              Remove
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button type="button" onClick={addTerm} style={{ fontSize: 11.5, fontWeight: 700, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
          + Add term
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{ fontSize: 11.5, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: pending ? "default" : "pointer" }}
        >
          {pending ? "Saving & generating…" : "Save & generate instalments"}
        </button>
      </div>

      {error && <div style={{ marginTop: 8, fontSize: 12, color: "var(--critical)" }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--good)" }}>
          {result.instalmentsCreated} instalment{result.instalmentsCreated === 1 ? "" : "s"} created, {result.instalmentsUpdated} updated.
          {result.flagged.length > 0 && (
            <span style={{ color: "var(--warn)" }}>
              {" "}
              {result.flagged.length} student{result.flagged.length === 1 ? "" : "s"} skipped (already has payments against a changed amount): {result.flagged.map((f) => f.studentName).join(", ")}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
