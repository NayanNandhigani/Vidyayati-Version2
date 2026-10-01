"use client";

import { useMemo, useState, useTransition } from "react";
import { initials, studentName } from "@/lib/format";
import { avatarColorFor, gradeFor, gradeForScale, gradeColor, type GradeBand } from "@/lib/academic";
import { saveMarks } from "./actions";
import { competitionRanks, evaluateStudent, passMarkFor, resultLabel, type MarkCell } from "@/lib/exam-rules";
import { friendlyError } from "@/lib/friendly-error";

type Student = { id: string; firstName: string; surname: string };
type ExamSubject = { id: string; maxMarks: number; passMarks: number | null; subject: { id: string; name: string } };
type MarkValue = number | "AB";

export default function ExamMarksGrid({
  examId,
  examName,
  className,
  students,
  examSubjects,
  initialMarks,
  canEdit,
  gradeBands,
  failLabel,
}: {
  examId: string;
  examName: string;
  className: string;
  students: Student[];
  examSubjects: ExamSubject[];
  initialMarks: Record<string, Record<string, MarkValue>>;
  canEdit: boolean;
  gradeBands: GradeBand[];
  failLabel: string | null;
}) {
  const gradeForPct = (pct: number) => gradeForScale(pct, gradeBands) ?? gradeFor(pct);
  const [marks, setMarks] = useState(initialMarks);
  // Raw text of cells being typed in, and per-cell problems. A bad value
  // (over the maximum, negative, not a number) is shown as an error and
  // kept out of `marks` — it's never silently clamped.
  const [text, setText] = useState<Record<string, string>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState(students[0]?.id ?? null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [sortField, setSortField] = useState<"name" | "total">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function setMark(studentId: string, examSubjectId: string, value: MarkValue | undefined) {
    setMarks((prev) => {
      const row = { ...prev[studentId] };
      if (value === undefined) delete row[examSubjectId];
      else row[examSubjectId] = value;
      return { ...prev, [studentId]: row };
    });
    setCleared((prev) => {
      const next = new Set(prev);
      if (value === undefined) next.add(`${studentId}:${examSubjectId}`);
      else next.delete(`${studentId}:${examSubjectId}`);
      return next;
    });
    setSaved(false);
  }

  function typeMark(studentId: string, es: ExamSubject, raw: string) {
    const key = `${studentId}:${es.id}`;
    setSaveError(null);
    setText((prev) => ({ ...prev, [key]: raw }));
    const trimmed = raw.trim();
    let problem: string | null = null;
    if (trimmed === "") {
      setMark(studentId, es.id, undefined);
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) problem = "Not a number";
      else if (n < 0) problem = "Can't be negative";
      else if (n > es.maxMarks) problem = `Max is ${es.maxMarks}`;
      else if (Math.round(n * 100) !== n * 100) problem = "At most 2 decimals";
      else setMark(studentId, es.id, n);
    }
    setCellErrors((prev) => {
      const next = { ...prev };
      if (problem) next[key] = problem;
      else delete next[key];
      return next;
    });
  }

  function toggleAbsent(studentId: string, es: ExamSubject, isAbsent: boolean) {
    const key = `${studentId}:${es.id}`;
    setText((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMark(studentId, es.id, isAbsent ? undefined : "AB");
  }

  // Same rules as the stored results and report cards (lib/exam-rules.ts):
  // a total only once every subject is entered; AB counts 0 and fails.
  function evaluate(studentId: string) {
    const row = marks[studentId] ?? {};
    const cells: Record<string, MarkCell> = {};
    for (const es of examSubjects) {
      const v = row[es.id];
      if (v !== undefined) cells[es.id] = v === "AB" ? { obtained: null, absent: true } : { obtained: v, absent: false };
    }
    return evaluateStudent(examSubjects.map((es) => ({ id: es.id, maxMarks: es.maxMarks, passMarks: es.passMarks })), cells);
  }
  function rowTotal(studentId: string) {
    const ev = evaluate(studentId);
    return ev.status === "COMPLETE" ? ev.total : -1;
  }

  function toggleSort(field: "name" | "total") {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "total" ? "desc" : "asc");
    }
  }

  // Sorted client-side — this grid already holds every student+mark for
  // one exam/class in memory, no server round-trip needed to reorder it.
  const sortedStudents = useMemo(() => {
    const sorted = [...students].sort((a, b) =>
      sortField === "name" ? studentName(a).localeCompare(studentName(b)) : rowTotal(a.id) - rowTotal(b.id)
    );
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [students, sortField, sortDir, marks]);

  const errorCount = Object.keys(cellErrors).length;

  function save() {
    if (errorCount > 0) {
      setSaveError(`${errorCount} mark${errorCount === 1 ? " is" : "s are"} invalid (shown in red). Fix ${errorCount === 1 ? "it" : "them"} before saving.`);
      return;
    }
    setSaveError(null);
    const payload: Record<string, Record<string, number | "AB" | null>> = {};
    for (const [studentId, row] of Object.entries(marks)) payload[studentId] = { ...row };
    for (const key of cleared) {
      const [studentId, esId] = key.split(":") as [string, string];
      payload[studentId] = { ...payload[studentId], [esId]: null };
    }
    startTransition(async () => {
      try {
        const res = await saveMarks(examId, payload);
        if (res.error) {
          setSaveError(res.error);
          if (res.invalid) setCellErrors(Object.fromEntries(res.invalid.map((i) => [`${i.studentId}:${i.examSubjectId}`, "Invalid"])));
          return;
        }
        setCleared(new Set());
        setSaved(true);
      } catch (e) {
        setSaveError(friendlyError(e, "Marks weren't saved. Please try again."));
      }
    });
  }

  const preview = useMemo(() => {
    if (!previewId) return null;
    const student = students.find((s) => s.id === previewId);
    if (!student) return null;
    const row = marks[previewId] ?? {};
    const ev = evaluate(previewId);
    if (ev.status !== "COMPLETE") return { student, row, ev, total: null, max: null, pct: null, rank: null, rankOf: 0, passed: null };
    const complete = students.map((s) => ({ id: s.id, ev: evaluate(s.id) })).filter((x) => x.ev.status === "COMPLETE");
    const ranks = competitionRanks(complete.map((x) => ({ id: x.id, total: x.ev.status === "COMPLETE" ? x.ev.total : 0 })));
    return { student, row, ev, total: ev.total, max: ev.max, pct: ev.percentage, rank: ranks.get(previewId) ?? null, rankOf: complete.length, passed: ev.passed };
  }, [previewId, marks, students, examSubjects]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 16, flex: 1, minHeight: 0 }}>
      <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {examName} · {className} · Marks Entry
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>Click a cell to preview that student's report card · click "AB" to mark a student absent for a subject</div>
          </div>
          {canEdit && (
            <button
              onClick={save}
              disabled={pending}
              style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1, flex: "none" }}
            >
              {pending ? "Saving…" : saved ? "Saved ✓" : "Save Marks"}
            </button>
          )}
        </div>
        {(saveError || errorCount > 0) && (
          <div role="alert" style={{ padding: "8px 20px", fontSize: 12.5, fontWeight: 600, color: "var(--critical)", background: "var(--critical-tint)", borderBottom: "1px solid var(--line)" }}>
            {saveError ?? `${errorCount} mark${errorCount === 1 ? " is" : "s are"} invalid: ${Object.entries(cellErrors).slice(0, 3).map(([k, m]) => `${studentName(students.find((st) => st.id === k.split(":")[0]) ?? { firstName: "", surname: "" })} — ${m}`).join("; ")}. Invalid marks aren't saved.`}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `1.75fr repeat(${examSubjects.length}, 0.8fr) 0.85fr 0.8fr`,
            padding: "11px 20px",
            borderBottom: "1px solid var(--line)",
            fontSize: 10,
            color: "var(--faint)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <div onClick={() => toggleSort("name")} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: sortField === "name" ? "var(--marigold-deep)" : undefined }}>
            Student <span style={{ fontSize: 9, opacity: sortField === "name" ? 1 : 0.35 }}>{sortField === "name" && sortDir === "desc" ? "▼" : "▲"}</span>
          </div>
          {examSubjects.map((es) => (
            <div key={es.id} style={{ textAlign: "center" }}>
              {es.subject.name}
            </div>
          ))}
          <div onClick={() => toggleSort("total")} style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: sortField === "total" ? "var(--marigold-deep)" : undefined }}>
            Total <span style={{ fontSize: 9, opacity: sortField === "total" ? 1 : 0.35 }}>{sortField === "total" && sortDir === "asc" ? "▲" : "▼"}</span>
          </div>
          <div style={{ textAlign: "center" }}>%</div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {students.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No students in this class.</div>}
          {sortedStudents.map((s) => {
            const ev = evaluate(s.id);
            const pct = ev.status === "COMPLETE" ? ev.percentage : null;
            const selected = s.id === previewId;
            return (
              <div
                key={s.id}
                onClick={() => setPreviewId(s.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: `1.75fr repeat(${examSubjects.length}, 0.8fr) 0.85fr 0.8fr`,
                  alignItems: "center",
                  padding: "10.5px 20px",
                  borderBottom: "1px solid var(--line)",
                  background: selected ? "var(--marigold-tint)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColorFor(s.id), fontSize: 10.5, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flex: "none" }}>
                    {initials(studentName(s))}
                  </div>
                  <div style={{ fontWeight: selected ? 700 : 600, fontSize: 13 }}>{studentName(s)}</div>
                </div>
                {examSubjects.map((es) => {
                  const v = marks[s.id]?.[es.id];
                  const isAbsent = v === "AB";
                  const key = `${s.id}:${es.id}`;
                  const cellError = cellErrors[key];
                  const failing = !cellError && typeof v === "number" && v < passMarkFor(es);
                  return (
                    <div key={es.id} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 2, margin: "1px 0" }}>
                      <input
                        type="number"
                        min={0}
                        max={es.maxMarks}
                        step="any"
                        value={text[key] ?? (typeof v === "number" ? String(v) : "")}
                        placeholder={isAbsent ? "AB" : "—"}
                        title={cellError ?? (isAbsent ? "Absent" : undefined)}
                        aria-invalid={!!cellError}
                        disabled={!canEdit || isAbsent}
                        onChange={(e) => typeMark(s.id, es, e.target.value)}
                        className="mono"
                        style={{
                          width: "100%",
                          textAlign: "center",
                          border: cellError ? "2px solid var(--critical)" : canEdit ? `1px solid ${failing ? "var(--critical-border)" : "var(--marigold-tint)"}` : "none",
                          background: isAbsent ? "var(--line)" : cellError ? "#fff" : failing ? "var(--critical-tint)" : canEdit ? "var(--marigold-tint)" : "transparent",
                          color: failing ? "var(--critical)" : "var(--ink)",
                          fontWeight: 700,
                          fontSize: 12,
                          borderRadius: 5,
                          padding: "5px 0",
                        }}
                      />
                      {canEdit && (
                        <span
                          onClick={() => toggleAbsent(s.id, es, isAbsent)}
                          title="Mark absent"
                          style={{ fontSize: 8.5, fontWeight: 700, color: isAbsent ? "#fff" : "var(--faint)", background: isAbsent ? "var(--critical)" : "transparent", borderRadius: 3, padding: "1px 3px", cursor: "pointer", flex: "none" }}
                        >
                          AB
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="mono" style={{ textAlign: "center", fontWeight: 700 }}>
                  {ev.status === "COMPLETE" ? ev.total : ev.status === "INCOMPLETE" ? <span title="Not every subject is entered yet" style={{ fontSize: 10.5, color: "var(--faint)", fontWeight: 600 }}>{ev.entered}/{ev.of}</span> : "—"}
                </div>
                <div className="mono" style={{ textAlign: "center", fontWeight: 700, color: pct === null ? "var(--faint)" : pct >= 90 ? "var(--good)" : pct >= 33 ? "var(--marigold-deep)" : "var(--critical)" }}>
                  {pct === null ? "—" : pct.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Report Card Preview</div>
        {preview ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: avatarColorFor(preview.student.id), fontSize: 14.5, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flex: "none" }}>
                {initials(studentName(preview.student))}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{studentName(preview.student)}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {className} · {examName}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 14 }}>
              {examSubjects.map((es) => {
                const v = preview.row[es.id];
                const isAbsent = v === "AB";
                const pct = typeof v === "number" ? (v / es.maxMarks) * 100 : 0;
                return (
                  <div key={es.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "var(--muted)" }}>{es.subject.name}</span>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {isAbsent ? "AB" : v === undefined ? "—" : v}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: "var(--marigold-tint)" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 4, background: "var(--marigold)" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
              {preview.total === null ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {preview.ev.status === "INCOMPLETE"
                    ? `Incomplete — ${preview.ev.entered} of ${preview.ev.of} subjects entered. Total, grade and rank show once every subject has a mark or AB.`
                    : "No marks entered yet. Total, grade and rank show once every subject has a mark or AB."}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Total</span>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      {preview.total} / {preview.max}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Percentage</span>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      {preview.pct!.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Grade</span>
                    <span className="pill" style={{ background: "var(--paper)", color: gradeColor(gradeForPct(preview.pct!)), border: "1px solid var(--line)", fontSize: 13, padding: "4px 12px" }}>
                      {gradeForPct(preview.pct!)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Result</span>
                    <span style={{ fontWeight: 700, color: preview.passed ? "var(--good)" : "var(--critical)" }}>{resultLabel(!!preview.passed, failLabel)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>Rank in class</span>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      {preview.rank} of {preview.rankOf}
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Select a student to preview their report card.</div>
        )}
      </div>
    </div>
  );
}
