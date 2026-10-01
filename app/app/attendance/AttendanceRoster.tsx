"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { initials, studentName } from "@/lib/format";
import { avatarColorFor } from "@/lib/academic";
import type { AttendanceStatus } from "@prisma/client";
import { saveAttendance } from "./actions";
import { friendlyError } from "@/lib/friendly-error";
import { FormError, FormWarning } from "@/components/form/FormMessages";

type Student = { id: string; firstName: string; surname: string; admissionNo: string };

type Props = {
  classId: string;
  date: string;
  students: Student[];
  initialMarks: Record<string, AttendanceStatus>;
  today: string; // IST "YYYY-MM-DD"
  canEdit: boolean;
};

const MARKS: { key: AttendanceStatus; label: string; className: string }[] = [
  { key: "PRESENT", label: "P", className: "att-p" },
  { key: "ABSENT", label: "A", className: "att-a" },
  { key: "HALF_DAY", label: "H", className: "att-h" },
];

type SortField = "name" | "admissionNo";

export default function AttendanceRoster({ classId, date, today, students, initialMarks, canEdit: canEditClass }: Props) {
  // Attendance can't be marked ahead of time; a future date is view-only.
  const isFuture = date > today;
  const canEdit = canEditClass && !isFuture;
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(initialMarks);
  const [savedMarks, setSavedMarks] = useState<Record<string, AttendanceStatus>>(initialMarks);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const isDirty = pending || Object.keys(marks).some((id) => marks[id] !== savedMarks[id]);

  // Losing a save mid-navigation was the actual data-loss bug here — the
  // roster took long enough to save that a teacher would tab away or hit
  // back before it finished, and the browser gave zero warning either way
  // (during the save, or with unsaved local edits never submitted at all).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Sorted entirely client-side — the roster is already fully loaded (one
  // class, one day), no server round-trip needed the way a paginated list
  // would.
  const sortedStudents = useMemo(() => {
    const sorted = [...students].sort((a, b) => {
      const av = sortField === "name" ? studentName(a) : a.admissionNo;
      const bv = sortField === "name" ? studentName(b) : b.admissionNo;
      return av.localeCompare(bv);
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [students, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const counts = useMemo(() => {
    let present = 0,
      absent = 0,
      half = 0;
    for (const s of students) {
      const m = marks[s.id];
      if (m === "PRESENT") present++;
      else if (m === "ABSENT") absent++;
      else if (m === "HALF_DAY") half++;
    }
    const total = students.length;
    const rate = total > 0 ? (present / total) * 100 : 0;
    return { present, absent, half, rate };
  }, [marks, students]);

  function setMark(studentId: string, status: AttendanceStatus) {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAllPresent() {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) next[s.id] = "PRESENT";
    setMarks(next);
  }

  function save() {
    const toSave = marks;
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveAttendance(classId, date, toSave);
        if (res.error) {
          setError(res.error);
          return;
        }
        setSavedMarks(toSave);
        setSavedAt(Date.now());
      } catch (e) {
        setError(friendlyError(e, "Attendance wasn't saved. Please try again."));
      }
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="disp" style={{ fontSize: 21 }}>
          Mark Attendance
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canEdit && (
            <>
              <span
                onClick={markAllPresent}
                style={{ background: "var(--good)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Mark All Present
              </span>
              <button
                onClick={save}
                disabled={pending}
                style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}
              >
                {pending ? "Saving…" : savedAt ? "Saved ✓" : "Save Attendance"}
              </button>
            </>
          )}
        </div>
      {isFuture && <FormWarning message={`Attendance can't be marked for a future date. Pick today (${today}) or an earlier date.`} />}
      {!isFuture && students.length > 0 && Object.keys(initialMarks).length === 0 && !savedAt && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No attendance has been saved for this date yet.</div>
      )}
      <FormError message={error} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13 }}>
        <CountTile label="Present" value={counts.present} color="var(--good)" />
        <CountTile label="Absent" value={counts.absent} color="var(--critical)" />
        <CountTile label="Half-day" value={counts.half} color="var(--warn)" />
        <CountTile label="Class attendance rate" value={`${counts.rate.toFixed(1)}%`} />
      </div>

      <div className="card" style={{ padding: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr 1fr", padding: "13px 22px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <div onClick={() => toggleSort("name")} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: sortField === "name" ? "var(--marigold-deep)" : undefined }}>
            Student <span style={{ fontSize: 9, opacity: sortField === "name" ? 1 : 0.35 }}>{sortField === "name" && sortDir === "desc" ? "▼" : "▲"}</span>
          </div>
          <div onClick={() => toggleSort("admissionNo")} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: sortField === "admissionNo" ? "var(--marigold-deep)" : undefined }}>
            Adm. No. <span style={{ fontSize: 9, opacity: sortField === "admissionNo" ? 1 : 0.35 }}>{sortField === "admissionNo" && sortDir === "desc" ? "▼" : "▲"}</span>
          </div>
          <div style={{ textAlign: "right" }}>Mark</div>
        </div>

        <div style={{ overflowY: "auto" }}>
          {students.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No students in this class.</div>
          )}
          {sortedStudents.map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr 1fr", alignItems: "center", padding: "11px 22px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColorFor(s.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, color: "#fff", flex: "none" }}>
                  {initials(studentName(s))}
                </div>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{studentName(s)}</span>
              </div>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>
                {s.admissionNo}
              </div>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                {MARKS.map((m) => {
                  const on = marks[s.id] === m.key;
                  return (
                    <span
                      key={m.key}
                      onClick={() => canEdit && setMark(s.id, m.key)}
                      style={{
                        width: 34,
                        height: 30,
                        borderRadius: 7,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        border: `1.5px solid ${on ? statusColor(m.key) : "var(--line)"}`,
                        color: on ? "#fff" : "var(--faint)",
                        background: on ? statusColor(m.key) : "transparent",
                        cursor: canEdit ? "pointer" : "default",
                        userSelect: "none",
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
    </>
  );
}

function statusColor(status: AttendanceStatus) {
  if (status === "PRESENT") return "var(--good)";
  if (status === "ABSENT") return "var(--critical)";
  return "var(--warn)";
}

function CountTile({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="card" style={{ padding: "14px 17px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}
