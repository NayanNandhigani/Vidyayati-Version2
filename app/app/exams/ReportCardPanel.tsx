import { gradeColor } from "@/lib/academic";

// total/pct/grade/rank are null unless the student's result is complete
// (lib/exam-rules.ts); `status` then says why ("Not entered", "Incomplete …").
type Row = { id: string; name: string; total: number | null; maxTotal: number | null; pct: number | null; grade: string | null; resultStatus: "PASS" | "FAIL" | null; resultLabel: string | null; rank: number | null; status: string | null };

export default function ReportCardPanel({ examId, examApproved, rows }: { examId: string; examApproved: boolean; rows: Row[] }) {
  if (!examApproved) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
        Report cards are available once this exam has been approved by a School Admin.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>Report cards</div>
        <a
          href={`/api/exams/${examId}/report-card/pdf`}
          target="_blank"
          rel="noreferrer"
          style={{ background: "var(--marigold)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
        >
          Download all (class) ↓
        </a>
      </div>

      <div className="m-thead" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.8fr 0.7fr 0.9fr", padding: "11px 20px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <div>Student</div>
        <div style={{ textAlign: "right" }}>Total</div>
        <div style={{ textAlign: "right" }}>%</div>
        <div style={{ textAlign: "center" }}>Grade</div>
        <div style={{ textAlign: "center" }}>Result</div>
        <div style={{ textAlign: "right" }}>Rank</div>
        <div />
      </div>

      {rows.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No students in this class.</div>}

      {rows.map((r) => (
        <div key={r.id} className="m-row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.8fr 0.7fr 0.9fr auto", alignItems: "center", padding: "11px 20px", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div className="mono" style={{ textAlign: "right" }}>
            {r.total === null ? <span style={{ color: "var(--faint)", fontFamily: "inherit", fontSize: 12 }}>{r.status ?? "—"}</span> : (
              <>
                {r.total} <span style={{ color: "var(--faint)", fontWeight: 500 }}>/ {r.maxTotal}</span>
              </>
            )}
          </div>
          <div className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{r.pct === null ? "—" : `${r.pct.toFixed(1)}%`}</div>
          <div style={{ textAlign: "center" }}>
            {r.grade === null ? (
              <span style={{ color: "var(--faint)" }}>—</span>
            ) : (
              <span className="pill" style={{ background: "var(--paper)", color: gradeColor(r.grade), border: "1px solid var(--line)" }}>
                {r.grade}
              </span>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            {r.resultStatus && (
              <span className="pill" style={{ background: r.resultStatus === "PASS" ? "var(--good-tint)" : "var(--critical-tint)", color: r.resultStatus === "PASS" ? "var(--good)" : "var(--critical)" }}>
                {r.resultLabel ?? (r.resultStatus === "PASS" ? "Pass" : "Fail")}
              </span>
            )}
          </div>
          <div className="mono" style={{ textAlign: "right", color: "var(--muted)" }}>
            {r.rank ?? "—"}
          </div>
          <a href={`/api/exams/${examId}/report-card/pdf?studentId=${r.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-deep)", textDecoration: "none", marginLeft: 14, whiteSpace: "nowrap" }}>
            Download
          </a>
        </div>
      ))}
    </div>
  );
}
