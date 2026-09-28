import Link from "next/link";

/** Students vs. Staff attendance — admin-only, since staff attendance marking is admin-only per the QA ask. */
export default function AttendanceViewToggle({ view, date }: { view: "students" | "staff"; date: string }) {
  return (
    <div style={{ display: "flex", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: 3 }}>
      <Link
        href={`/app/attendance?date=${date}`}
        style={{ textAlign: "center", padding: "6px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, textDecoration: "none", background: view === "students" ? "var(--marigold)" : "transparent", color: view === "students" ? "#fff" : "var(--faint)" }}
      >
        Students
      </Link>
      <Link
        href={`/app/attendance?view=staff&date=${date}`}
        style={{ textAlign: "center", padding: "6px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, textDecoration: "none", background: view === "staff" ? "var(--marigold)" : "transparent", color: view === "staff" ? "#fff" : "var(--faint)" }}
      >
        Staff
      </Link>
    </div>
  );
}
