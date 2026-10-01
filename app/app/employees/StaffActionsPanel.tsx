"use client";

import DepartmentSelect from "@/components/form/DepartmentSelect";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StaffCategory, UserStatus } from "@prisma/client";
import { updateStaffCore, deactivateStaff, reactivateStaff, resetStaffPassword, regenerateStaffSetupLink, deleteStaff, type StaffCoreFields } from "./actions";

export default function StaffActionsPanel({ staffId, fields: initialFields, userStatus }: { staffId: string; fields: StaffCoreFields; userStatus: UserStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<StaffCoreFields>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  function set<K extends keyof StaffCoreFields>(key: K, value: StaffCoreFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = await updateStaffCore(staffId, fields);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setEditing(false);
        router.refresh();
      }
    });
  }

  function toggleActive() {
    if (userStatus === "ACTIVE" && !confirmingDeactivate) {
      setConfirmingDeactivate(true);
      return;
    }
    setConfirmingDeactivate(false);
    startTransition(async () => {
      if (userStatus === "ACTIVE") await deactivateStaff(staffId);
      else await reactivateStaff(staffId);
      router.refresh();
    });
  }

  function doResetPassword() {
    startTransition(async () => {
      await resetStaffPassword(staffId);
      setSetupToken(null);
      router.refresh();
    });
  }

  function doRegenerateLink() {
    startTransition(async () => {
      const res = await regenerateStaffSetupLink(staffId);
      setSetupToken(res.setupToken);
    });
  }

  function doDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteStaff(staffId);
      router.push("/app/employees");
    });
  }

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Staff actions</span>
        <span className="pill" style={{ background: userStatus === "ACTIVE" ? "var(--good-tint)" : "var(--critical-tint)", color: userStatus === "ACTIVE" ? "var(--good)" : "var(--critical)", fontSize: 10.5 }}>
          {userStatus === "ACTIVE" ? "Login active" : "Login deactivated"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SmallButton label="Edit" active={editing} onClick={() => setEditing((v) => !v)} />
          <SmallButton
            label={userStatus === "ACTIVE" ? (confirmingDeactivate ? "Confirm deactivate" : "Deactivate") : "Reactivate"}
            onClick={toggleActive}
            danger={userStatus === "ACTIVE"}
          />
          <SmallButton label="Reset password" onClick={doResetPassword} />
          <SmallButton label="Regenerate setup link" onClick={doRegenerateLink} />
          <SmallButton label={confirmingDelete ? "Confirm delete" : "Delete"} onClick={doDelete} danger />
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--critical)" }}>{error}</div>}

      {setupToken && (
        <div style={{ background: "var(--good-tint)", border: "1px solid var(--good)", borderRadius: 8, padding: 12, fontSize: 12 }}>
          New one-time setup link — share it now, it won&apos;t be shown again:
          <div className="mono" style={{ marginTop: 6, padding: "8px 10px", background: "var(--card)", borderRadius: 6, wordBreak: "break-all", fontSize: 11.5 }}>
            {typeof window !== "undefined" ? window.location.origin : ""}/setup-account?token={setupToken}
          </div>
        </div>
      )}

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="field">
              Name
              <input className="in" value={fields.name} onChange={(e) => set("name", e.target.value)} style={{ fontSize: 12 }} />
            </label>
            <label className="field">
              Phone
              <input className="in mono" value={fields.phone} onChange={(e) => set("phone", e.target.value)} style={{ fontSize: 12 }} />
            </label>
            <label className="field">
              Designation
              <input className="in" value={fields.designation} onChange={(e) => set("designation", e.target.value)} style={{ fontSize: 12 }} />
            </label>
            <label className="field">
              Department
              <DepartmentSelect value={fields.department} onChange={(v) => set("department", v)} style={{ fontSize: 12 }} />
            </label>
            <label className="field">
              Staff category
              <select className="in" value={fields.staffCategory} onChange={(e) => set("staffCategory", e.target.value as StaffCategory)} style={{ fontSize: 12 }}>
                <option value="TEACHING">Teaching</option>
                <option value="NON_TEACHING">Non-teaching</option>
              </select>
            </label>
            <label className="field">
              Date of joining
              <input className="in mono" type="date" value={fields.dateJoined} onChange={(e) => set("dateJoined", e.target.value)} style={{ fontSize: 12 }} />
            </label>
          </div>
          <div>
            <button type="button" onClick={save} disabled={pending} style={{ fontSize: 12, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallButton({ label, onClick, active, danger }: { label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        background: active ? "var(--marigold)" : danger ? "var(--card)" : "var(--card)",
        color: active ? "#fff" : danger ? "var(--critical)" : "var(--ink)",
        border: danger ? "1px solid var(--critical)" : "1px solid var(--line)",
        borderRadius: 6,
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
