"use client";

import { useEffect, useState, useTransition } from "react";
import { getClassesForYear, getActiveStudentsInClass, bulkPromoteClass } from "./actions";

type ClassOption = { id: string; grade: string; section: string };
type YearOption = { id: string; label: string };
type StudentOption = { id: string; name: string };

export default function PromoteStudentsPanel({ years, currentYearId, currentClasses }: { years: YearOption[]; currentYearId: string; currentClasses: ClassOption[] }) {
  const [pending, startTransition] = useTransition();
  const [sourceClassId, setSourceClassId] = useState(currentClasses[0]?.id ?? "");
  const [targetYearId, setTargetYearId] = useState(years.find((y) => y.id !== currentYearId)?.id ?? "");
  const [targetClasses, setTargetClasses] = useState<ClassOption[]>([]);
  const [promoteToClassId, setPromoteToClassId] = useState("");
  const [holdBackClassId, setHoldBackClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [heldBack, setHeldBack] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ promoted: number; heldBack: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const sourceClass = currentClasses.find((c) => c.id === sourceClassId);

  useEffect(() => {
    if (!sourceClassId) return;
    getActiveStudentsInClass(sourceClassId).then(setStudents);
    setHeldBack(new Set());
    setResult(null);
  }, [sourceClassId]);

  useEffect(() => {
    if (!targetYearId) return;
    getClassesForYear(targetYearId).then((classes) => {
      setTargetClasses(classes);
      const nextGrade = classes.find((c) => c.grade !== sourceClass?.grade);
      setPromoteToClassId(nextGrade?.id ?? classes[0]?.id ?? "");
      const repeat = sourceClass ? classes.find((c) => c.grade === sourceClass.grade) : undefined;
      setHoldBackClassId(repeat?.id ?? classes[0]?.id ?? "");
    });
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetYearId, sourceClassId]);

  function toggleHeldBack(studentId: string) {
    setHeldBack((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function promote() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    startTransition(async () => {
      const res = await bulkPromoteClass(sourceClassId, promoteToClassId, holdBackClassId, [...heldBack]);
      setResult(res);
      setStudents([]);
    });
  }

  const canPromote = sourceClassId && targetYearId && promoteToClassId && holdBackClassId && students.length > 0;

  return (
    <div>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>Promote Students</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
        Move every active student in a class to the next grade for a new academic year. Pick students to hold back — they repeat the current grade instead. Pending fees travel with the student regardless of class, so nothing needs to be carried forward manually.
      </div>

      <div className="m-1col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16, maxWidth: 560 }}>
        <label className="field">
          From class (this year)
          <select className="in" value={sourceClassId} onChange={(e) => setSourceClassId(e.target.value)}>
            {currentClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grade}-{c.section}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Target academic year
          <select className="in" value={targetYearId} onChange={(e) => setTargetYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Promote to class
          <select className="in" value={promoteToClassId} onChange={(e) => setPromoteToClassId(e.target.value)}>
            {targetClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grade}-{c.section}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Held-back students go to
          <select className="in" value={holdBackClassId} onChange={(e) => setHoldBackClassId(e.target.value)}>
            {targetClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grade}-{c.section}
              </option>
            ))}
          </select>
        </label>
      </div>

      {targetClasses.length === 0 && targetYearId && (
        <div style={{ fontSize: 12.5, color: "var(--warn)", marginBottom: 12 }}>No classes exist yet for this academic year — create them in Classes &amp; Sections first.</div>
      )}

      {students.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            {students.length} active student{students.length === 1 ? "" : "s"} — check any to hold back
          </div>
          <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {students.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, background: heldBack.has(s.id) ? "var(--warn-tint)" : "var(--paper)", borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}>
                <input type="checkbox" checked={heldBack.has(s.id)} onChange={() => toggleHeldBack(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={promote}
        disabled={pending || !canPromote}
        style={{ fontSize: 13, fontWeight: 700, background: confirming ? "var(--critical)" : "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: canPromote ? "pointer" : "default", opacity: canPromote ? 1 : 0.5 }}
      >
        {pending ? "Promoting…" : confirming ? `Confirm — promote ${students.length - heldBack.size}, hold back ${heldBack.size}` : "Promote class"}
      </button>

      {result && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--good)" }}>
          Done — {result.promoted} promoted, {result.heldBack} held back.
        </div>
      )}
    </div>
  );
}
