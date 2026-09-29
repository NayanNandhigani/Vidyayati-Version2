"use client";

import { useRouter } from "next/navigation";

export default function TimetableFilter({
  classes,
  classId,
  teachers,
  teacherId,
  ownTeacherId,
  classTeacherName,
}: {
  classes: { id: string; grade: string; section: string }[];
  classId: string;
  teachers: { id: string; name: string }[];
  teacherId: string | null;
  ownTeacherId: string | null;
  classTeacherName: string | null;
}) {
  const router = useRouter();
  const byTeacher = teacherId !== null;
  // A staffer with no class access only ever sees their own week, so there
  // is nothing to switch between.
  const canBrowse = classes.length > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {canBrowse && (
        <select
          className="in"
          value={byTeacher ? "teacher" : "class"}
          onChange={(e) => {
            if (e.target.value === "class") router.push("/app/timetable");
            else router.push(`/app/timetable?teacherId=${ownTeacherId ?? teachers[0]?.id ?? ""}`);
          }}
          style={{ width: "auto", background: "var(--card)" }}
          aria-label="View by"
        >
          <option value="class">By class</option>
          <option value="teacher">By teacher</option>
        </select>
      )}
      {byTeacher ? (
        canBrowse && (
          <select
            className="in"
            value={teacherId}
            onChange={(e) => router.push(`/app/timetable?teacherId=${e.target.value}`)}
            style={{ width: "auto", background: "var(--card)", fontWeight: 600 }}
            aria-label="Teacher"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === ownTeacherId ? " (me)" : ""}
              </option>
            ))}
          </select>
        )
      ) : (
        <select
          className="in mono"
          value={classId}
          onChange={(e) => router.push(`/app/timetable?classId=${e.target.value}`)}
          style={{ width: "auto", background: "var(--card)", fontWeight: 600 }}
          aria-label="Class"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              Class {c.grade}-{c.section}
            </option>
          ))}
        </select>
      )}
      {!byTeacher && classTeacherName && (
        <span style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
          Class teacher: {classTeacherName}
        </span>
      )}
    </div>
  );
}
