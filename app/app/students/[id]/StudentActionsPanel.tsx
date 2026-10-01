"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StudentStatus } from "@prisma/client";
import { updateStudentProfile, changeStudentStatus, transferStudentSection, deleteStudent } from "../actions";
import StudentDetailsFields from "@/components/students/StudentDetailsFields";
import type { StudentDetails, StudentDetailErrors } from "@/lib/student-fields";
import { friendlyError } from "@/lib/friendly-error";

type ClassOption = { id: string; grade: string; section: string };

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRANSFERRED", label: "Transferred-out" },
  { value: "ALUMNI", label: "Alumni / Passed-out" },
  { value: "INACTIVE", label: "Inactive" },
];

export default function StudentActionsPanel({
  studentId,
  fields: initialFields,
  aadhaarOnFile,
  grade,
  today,
  status,
  transferOutDate,
  currentClassId,
  classes,
}: {
  studentId: string;
  fields: StudentDetails;
  aadhaarOnFile: string | null; // masked
  grade: string;
  today: string;
  status: StudentStatus;
  transferOutDate: string | null;
  currentClassId: string;
  classes: ClassOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "edit" | "status" | "transfer">("none");
  const [fields, setFields] = useState<StudentDetails>(initialFields);
  const [fieldErrors, setFieldErrors] = useState<StudentDetailErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<StudentStatus>(status);
  const [newTransferDate, setNewTransferDate] = useState(transferOutDate ?? "");

  const [newClassId, setNewClassId] = useState(currentClassId);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function saveProfile() {
    startTransition(async () => {
      try {
        const res = await updateStudentProfile(studentId, fields);
        if (res.error) {
          setError(res.error);
          setFieldErrors(res.fieldErrors ?? {});
        } else {
          setError(null);
          setFieldErrors({});
          setFields((f) => ({ ...f, aadhaarNumber: "" }));
          setMode("none");
          router.refresh();
        }
      } catch (e) {
        setError(friendlyError(e, "The changes weren't saved. Please try again."));
      }
    });
  }

  function saveStatus() {
    startTransition(async () => {
      const res = await changeStudentStatus(studentId, newStatus, newStatus === "TRANSFERRED" ? newTransferDate : null);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setNotice(res.warning ?? null);
        setMode("none");
        router.refresh();
      }
    });
  }

  function saveTransfer() {
    startTransition(async () => {
      const res = await transferStudentSection(studentId, newClassId);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setMode("none");
        router.refresh();
      }
    });
  }

  function doDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteStudent(studentId);
      setNotice(res.warning ?? "Student marked inactive.");
      setConfirmingDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Student actions</span>
        <span className="pill" style={{ background: "var(--paper)", border: "1px solid var(--line)", fontSize: 10.5 }}>{STATUS_OPTIONS.find((s) => s.value === status)?.label}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton label="Edit profile" active={mode === "edit"} onClick={() => setMode(mode === "edit" ? "none" : "edit")} />
          <ActionButton label="Change status" active={mode === "status"} onClick={() => setMode(mode === "status" ? "none" : "status")} />
          <ActionButton label="Transfer section" active={mode === "transfer"} onClick={() => setMode(mode === "transfer" ? "none" : "transfer")} />
          <button
            type="button"
            onClick={doDelete}
            disabled={pending}
            style={{ fontSize: 11.5, fontWeight: 700, background: confirmingDelete ? "var(--critical)" : "var(--card)", color: confirmingDelete ? "#fff" : "var(--critical)", border: "1px solid var(--critical)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}
          >
            {confirmingDelete ? "Confirm delete" : "Delete"}
          </button>
        </div>
      </div>

      {notice && <div style={{ fontSize: 12, color: "var(--warn)" }}>{notice}</div>}
      {error && <div style={{ fontSize: 12, color: "var(--critical)" }}>{error}</div>}

      {mode === "edit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <StudentDetailsFields value={fields} onChange={setFields} errors={fieldErrors} today={today} grade={grade} aadhaarOnFile={aadhaarOnFile} compact />
          <div>
            <button type="button" onClick={saveProfile} disabled={pending} style={{ fontSize: 12, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}>
              {pending ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      )}

      {mode === "status" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10, maxWidth: 320 }}>
          <label className="field">
            Status
            <select className="in" value={newStatus} onChange={(e) => setNewStatus(e.target.value as StudentStatus)} style={{ fontSize: 12 }}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {newStatus === "TRANSFERRED" && (
            <label className="field">
              Transfer-out (TC) date
              <input className="in mono" type="date" value={newTransferDate} onChange={(e) => setNewTransferDate(e.target.value)} style={{ fontSize: 12 }} />
            </label>
          )}
          <div>
            <button type="button" onClick={saveStatus} disabled={pending} style={{ fontSize: 12, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}>
              {pending ? "Saving…" : "Save status"}
            </button>
          </div>
        </div>
      )}

      {mode === "transfer" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10, maxWidth: 320 }}>
          <label className="field">
            Move to class
            <select className="in" value={newClassId} onChange={(e) => setNewClassId(e.target.value)} style={{ fontSize: 12 }}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade}-{c.section}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button type="button" onClick={saveTransfer} disabled={pending || newClassId === currentClassId} style={{ fontSize: 12, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}>
              {pending ? "Moving…" : "Move student"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontSize: 11.5, fontWeight: 700, background: active ? "var(--marigold)" : "var(--card)", color: active ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
