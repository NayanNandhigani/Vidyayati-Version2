"use client";

import { useState, useTransition } from "react";
import type { AttendanceStatus } from "@prisma/client";
import { saveStaffAttendance } from "./actions";

type Staff = { id: string; name: string };

const MARKS: { key: AttendanceStatus; label: string }[] = [
  { key: "PRESENT", label: "P" },
  { key: "ABSENT", label: "A" },
  { key: "HALF_DAY", label: "H" },
];

const MARK_STYLE: Record<AttendanceStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: "var(--good-tint)", fg: "var(--good)" },
  ABSENT: { bg: "var(--critical-tint)", fg: "var(--critical)" },
  HALF_DAY: { bg: "var(--warn-tint)", fg: "var(--warn)" },
};

export default function StaffAttendanceRoster({ date, staff, initialMarks }: { date: string; staff: Staff[]; initialMarks: Record<string, AttendanceStatus> }) {
  const [marks, setMarks] = useState(initialMarks);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setAll(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of staff) next[s.id] = status;
    setMarks(next);
    setSavedAt(null);
  }

  function save() {
    startTransition(async () => {
      const res = await saveStaffAttendance(date, marks);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Staff attendance · {date}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{staff.length} staff members</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span onClick={() => setAll("PRESENT")} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--marigold-deep)", cursor: "pointer" }}>
            Mark all present
          </span>
          <button onClick={save} disabled={pending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}>
            {pending ? "Saving…" : savedAt ? "Saved ✓" : "Save Attendance"}
          </button>
        </div>
      </div>
      {error && <div style={{ padding: "8px 20px", fontSize: 12, color: "var(--critical)" }}>{error}</div>}
      <div style={{ overflowY: "auto" }}>
        {staff.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No staff found.</div>}
        {staff.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {MARKS.map((m) => {
                const active = marks[s.id] === m.key;
                const style = MARK_STYLE[m.key];
                return (
                  <span
                    key={m.key}
                    onClick={() => {
                      setMarks((prev) => ({ ...prev, [s.id]: m.key }));
                      setSavedAt(null);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: active ? style.bg : "var(--paper)",
                      color: active ? style.fg : "var(--faint)",
                      border: active ? `1px solid ${style.fg}` : "1px solid var(--line)",
                    }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
