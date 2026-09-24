"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { avatarColorFor } from "@/lib/academic";
import { initials } from "@/lib/format";
import { advanceToApplication, deleteEnquiry, updateEnquiryCore, type EnquiryCoreFields } from "./actions";
import { rejectAdmission } from "./depth-actions";

type Enquiry = {
  id: string;
  applicantName: string;
  dob: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  parentContact: string;
  email: string | null;
  classApplied: string;
  stage: "ENQUIRY" | "APPLICATION" | "ADMITTED";
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  convertedStudentId: string | null;
  rejectionReason: string | null;
  parentName: string | null;
  address: string | null;
  enquirySource: string | null;
  followUpDate: string | null;
  notes: string | null;
  createdAt: string;
};

const APPROVAL_STYLE: Record<string, { bg: string; fg: string }> = {
  NONE: { bg: "var(--line)", fg: "var(--muted)" },
  PENDING: { bg: "var(--warn-tint)", fg: "var(--warn)" },
  APPROVED: { bg: "var(--good-tint)", fg: "var(--good)" },
  REJECTED: { bg: "var(--critical-tint)", fg: "var(--critical)" },
};

const COLS = [
  { key: "ENQUIRY" as const, label: "Enquiries", bg: "var(--marigold-tint)", fg: "var(--marigold-deep)" },
  { key: "APPLICATION" as const, label: "Applications", bg: "var(--teal-tint)", fg: "var(--teal)" },
  { key: "ADMITTED" as const, label: "Admitted", bg: "var(--good-tint)", fg: "var(--good)" },
  { key: "REJECTED" as const, label: "Rejected", bg: "var(--critical-tint)", fg: "var(--critical)" },
];

function columnFor(e: Enquiry): (typeof COLS)[number]["key"] {
  if (e.approvalStatus === "REJECTED") return "REJECTED";
  if (e.stage === "ADMITTED") return "ADMITTED";
  if (e.stage === "APPLICATION") return "APPLICATION";
  return "ENQUIRY";
}

export default function AdmissionsBoard({
  enquiries,
  classes,
  canEdit,
  isAdmin,
}: {
  enquiries: Enquiry[];
  classes: { id: string; grade: string; section: string }[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = enquiries.length;
  const applications = enquiries.filter((e) => e.stage === "APPLICATION" || e.stage === "ADMITTED").length;
  const admitted = enquiries.filter((e) => e.stage === "ADMITTED").length;
  const rejected = enquiries.filter((e) => e.approvalStatus === "REJECTED").length;
  const conversion = total ? Math.round((admitted / total) * 100) : 0;

  function move(id: string) {
    startTransition(async () => {
      await advanceToApplication(id);
    });
  }

  return (
    <>
      <div style={{ display: "flex", gap: 24, fontSize: 13, flexWrap: "wrap" }}>
        <div>
          <span style={{ color: "var(--muted)" }}>Total enquiries</span> <span className="mono" style={{ fontWeight: 700 }}>{total}</span>
        </div>
        <div style={{ color: "var(--faint)" }}>→</div>
        <div>
          <span style={{ color: "var(--muted)" }}>Total applications</span> <span className="mono" style={{ fontWeight: 700 }}>{applications}</span>
        </div>
        <div style={{ color: "var(--faint)" }}>→</div>
        <div>
          <span style={{ color: "var(--muted)" }}>Total admitted</span> <span className="mono" style={{ fontWeight: 700 }}>{admitted}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted)" }}>Total rejected</span> <span className="mono" style={{ fontWeight: 700 }}>{rejected}</span>
        </div>
        <div style={{ marginLeft: "auto", color: "var(--muted)" }}>
          Conversion rate <span className="mono" style={{ color: "var(--marigold-deep)", fontWeight: 700 }}>{conversion}%</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {COLS.map((col) => {
          const items = enquiries.filter((e) => columnFor(e) === col.key);
          return (
            <div key={col.key} style={{ background: col.bg, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{col.label}</span>
                <span className="mono" style={{ fontSize: 12, color: col.fg, fontWeight: 700 }}>
                  {items.length}
                </span>
              </div>
              {items.map((e) =>
                col.key === "ENQUIRY" ? (
                  <EnquiryCard key={e.id} e={e} classes={classes} canEdit={canEdit} expanded={expandedId === e.id} onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)} onMove={() => move(e.id)} pending={pending} />
                ) : (
                  <OtherCard key={e.id} e={e} canEdit={canEdit} isAdmin={isAdmin} />
                )
              )}
              {items.length === 0 && <div style={{ fontSize: 12, color: "var(--faint)" }}>Nothing here.</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function OtherCard({ e, canEdit }: { e: Enquiry; canEdit: boolean; isAdmin: boolean }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{e.applicantName}</span>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColorFor(e.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff" }}>
          {initials(e.applicantName)}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Applying for {e.classApplied}</div>
      <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
        {e.parentContact}
      </span>
      {e.approvalStatus === "REJECTED" && e.rejectionReason && (
        <div style={{ fontSize: 11, color: "var(--critical)", background: "var(--critical-tint)", borderRadius: 6, padding: "5px 8px" }}>Reason: {e.rejectionReason}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {e.approvalStatus !== "NONE" && (
          <span className="pill" style={{ background: APPROVAL_STYLE[e.approvalStatus].bg, color: APPROVAL_STYLE[e.approvalStatus].fg, fontSize: 10 }}>
            {e.approvalStatus}
          </span>
        )}
        {e.stage === "ADMITTED" && e.convertedStudentId ? (
          <Link href={`/app/students/${e.convertedStudentId}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--marigold-deep)", textDecoration: "none", marginLeft: "auto" }}>
            View student →
          </Link>
        ) : canEdit && e.stage !== "ADMITTED" ? (
          <Link href={`/app/admissions/${e.id}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--marigold-deep)", textDecoration: "none", marginLeft: "auto" }}>
            {e.approvalStatus === "REJECTED" ? "View / resubmit →" : "View application →"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function EnquiryCard({
  e,
  classes,
  canEdit,
  expanded,
  onToggle,
  onMove,
  pending,
}: {
  e: Enquiry;
  classes: { id: string; grade: string; section: string }[];
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: () => void;
  pending: boolean;
}) {
  const gradeOptions = Array.from(new Set(classes.map((c) => c.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const [fields, setFields] = useState<EnquiryCoreFields>({
    applicantName: e.applicantName,
    dob: e.dob ?? "",
    gender: e.gender ?? "",
    parentContact: e.parentContact,
    email: e.email ?? "",
    parentName: e.parentName ?? "",
    address: e.address ?? "",
    classApplied: e.classApplied,
    enquirySource: e.enquirySource ?? "",
    followUpDate: e.followUpDate ?? "",
    notes: e.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [innerPending, startTransition] = useTransition();

  function set<K extends keyof EnquiryCoreFields>(key: K, value: EnquiryCoreFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = await updateEnquiryCore(e.id, fields);
      if (res.error) setError(res.error);
      else {
        setError(null);
        onToggle();
      }
    });
  }

  function doDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      try {
        await deleteEnquiry(e.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete. Please try again.");
        setConfirmingDelete(false);
      }
    });
  }

  function doReject() {
    if (!rejectReason.trim()) return;
    startTransition(async () => {
      try {
        await rejectAdmission(e.id, rejectReason);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't reject. Please try again.");
      }
    });
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div onClick={canEdit ? onToggle : undefined} style={{ cursor: canEdit ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{e.applicantName}</span>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColorFor(e.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff" }}>
            {initials(e.applicantName)}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Applying for {e.classApplied}</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
          {e.parentContact}
        </span>
        {e.enquirySource && <div style={{ fontSize: 10.5, color: "var(--faint)" }}>Source: {e.enquirySource}</div>}
        {e.followUpDate && <div style={{ fontSize: 10.5, color: "var(--faint)" }}>Follow up: {new Date(e.followUpDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>}
      </div>

      {canEdit && !expanded && (
        <button onClick={onMove} disabled={pending} style={moveBtnStyle}>
          Move →
        </button>
      )}

      {expanded && canEdit && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }} onClick={(ev) => ev.stopPropagation()}>
          <label className="field">
            Applicant name
            <input className="in" value={fields.applicantName} onChange={(ev) => set("applicantName", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Date of birth
            <input className="in mono" type="date" value={fields.dob} onChange={(ev) => set("dob", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Gender
            <select className="in" value={fields.gender} onChange={(ev) => set("gender", ev.target.value as EnquiryCoreFields["gender"])} style={{ fontSize: 12 }}>
              <option value="">—</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="field">
            Email
            <input className="in" type="email" value={fields.email} onChange={(ev) => set("email", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Class applying for
            <select className="in" value={fields.classApplied} onChange={(ev) => set("classApplied", ev.target.value)} style={{ fontSize: 12 }}>
              <option value={fields.classApplied}>{fields.classApplied}</option>
              {gradeOptions.filter((g) => g !== fields.classApplied).map((g) => (
                <option key={g} value={g}>
                  Class {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Parent name
            <input className="in" value={fields.parentName} onChange={(ev) => set("parentName", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Contact number
            <input className="in mono" value={fields.parentContact} onChange={(ev) => set("parentContact", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Address
            <textarea className="in" rows={2} value={fields.address} onChange={(ev) => set("address", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Enquiry source
            <input className="in" value={fields.enquirySource} onChange={(ev) => set("enquirySource", ev.target.value)} placeholder="e.g. Walk-in, Referral, Website" style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Follow-up date
            <input className="in mono" type="date" value={fields.followUpDate} onChange={(ev) => set("followUpDate", ev.target.value)} style={{ fontSize: 12 }} />
          </label>
          <label className="field">
            Notes
            <textarea className="in" rows={2} value={fields.notes} onChange={(ev) => set("notes", ev.target.value)} style={{ fontSize: 12 }} />
          </label>

          {error && <div style={{ fontSize: 11.5, color: "var(--critical)" }}>{error}</div>}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={save} disabled={innerPending} style={{ fontSize: 11.5, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              Save
            </button>
            <button type="button" onClick={() => setRejecting((r) => !r)} disabled={innerPending} style={{ fontSize: 11.5, fontWeight: 700, background: "var(--card)", border: "1px solid var(--critical)", color: "var(--critical)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              Reject
            </button>
            <button type="button" onClick={doDelete} disabled={innerPending} style={{ fontSize: 11.5, fontWeight: 700, background: confirmingDelete ? "var(--critical)" : "var(--card)", color: confirmingDelete ? "#fff" : "var(--critical)", border: "1px solid var(--critical)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              {confirmingDelete ? "Confirm delete" : "Delete"}
            </button>
            {confirmingDelete && (
              <button type="button" onClick={() => setConfirmingDelete(false)} style={{ fontSize: 11.5, fontWeight: 600, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                Cancel
              </button>
            )}
          </div>

          {rejecting && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--critical-tint)", border: "1px solid var(--critical-border)", borderRadius: 8, padding: 10 }}>
              <textarea className="in" rows={2} value={rejectReason} onChange={(ev) => setRejectReason(ev.target.value)} placeholder="Reason for rejection" style={{ fontSize: 12 }} />
              <button type="button" onClick={doReject} disabled={innerPending || !rejectReason.trim()} style={{ fontSize: 11.5, fontWeight: 700, background: "var(--critical)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                Confirm reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const moveBtnStyle: React.CSSProperties = {
  alignSelf: "flex-end",
  border: "none",
  background: "var(--marigold)",
  color: "#fff",
  fontSize: 10.5,
  fontWeight: 700,
  padding: "4px 9px",
  borderRadius: 100,
  cursor: "pointer",
};
