"use client";

import { useState } from "react";
import Link from "next/link";

const ACTION_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  CREATE: { bg: "var(--good-tint)", fg: "var(--good)", label: "Created" },
  UPDATE: { bg: "var(--info-tint)", fg: "var(--info)", label: "Updated" },
  DELETE: { bg: "var(--critical-tint)", fg: "var(--critical)", label: "Deleted" },
};

export type AuditChangeLine = { field: string; before: string; after: string };

export type AuditLogRow = {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  /** Readable record type, e.g. "Transport Assignment". */
  entityLabel?: string | null;
  entityId: string;
  changes: unknown;
  occurredAt: string;
  /** The timestamp already formatted in IST on the server. */
  when: string;
  actorName: string | null;
  schoolName?: string | null;
  resolvedLabel?: string | null;
  href?: string | null;
  /** Readable "field: before → after" lines (UPDATE) or the deleted record's fields (DELETE). */
  changeLines?: AuditChangeLine[];
};

// A DELETEd row has no live record to look up — fall back to whatever
// name-ish field its own stored "before" snapshot happens to have.
const SNAPSHOT_NAME_FIELDS = ["title", "name", "applicantName", "description", "firstName"];

function deletedSnapshotLabel(typeLabel: string, changes: unknown): string | null {
  if (!changes || typeof changes !== "object" || !("deleted" in changes)) return null;
  const deleted = (changes as { deleted: Record<string, unknown> }).deleted;
  for (const field of SNAPSHOT_NAME_FIELDS) {
    const value = deleted[field];
    if (typeof value === "string" && value) {
      const surname = field === "firstName" && typeof deleted.surname === "string" ? ` ${deleted.surname}` : "";
      return `${typeLabel}: ${value}${surname}`;
    }
  }
  return null;
}

const typeLabelFor = (r: AuditLogRow) => r.entityLabel ?? r.entityType.replace(/([a-z])([A-Z])/g, "$1 $2");

/** One-line summary shown under the record name, e.g. "Class teacher: Asha → Ravi". */
function summary(r: AuditLogRow): string | null {
  const lines = r.changeLines ?? [];
  if (r.action !== "UPDATE" || lines.length === 0) return null;
  const first = lines.slice(0, 2).map((l) => `${l.field}: ${l.before} → ${l.after}`).join(" · ");
  return lines.length > 2 ? `${first} · +${lines.length - 2} more` : first;
}

export default function AuditLogTable({ rows, showSchool }: { rows: AuditLogRow[]; showSchool?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No mutations recorded for this filter yet.</div>;
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showSchool ? "1fr 1.3fr 1fr 1.4fr 1.3fr" : "1fr 1.3fr 1.6fr 1.3fr",
          fontSize: 11,
          color: "var(--faint)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          paddingBottom: 10,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>Action</div>
        <div>Entity</div>
        {showSchool && <div>School</div>}
        <div>Actor</div>
        <div>When</div>
      </div>

      {rows.map((r) => {
        const style = ACTION_STYLE[r.action];
        const isOpen = expanded === r.id;
        const typeLabel = typeLabelFor(r);
        const label = r.resolvedLabel ?? (r.action === "DELETE" ? deletedSnapshotLabel(typeLabel, r.changes) : null) ?? `${typeLabel} (no longer exists)`;
        const line = summary(r);
        return (
          <div key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
            <div
              onClick={() => setExpanded(isOpen ? null : r.id)}
              style={{
                display: "grid",
                gridTemplateColumns: showSchool ? "1fr 1.3fr 1fr 1.4fr 1.3fr" : "1fr 1.3fr 1.6fr 1.3fr",
                alignItems: "center",
                padding: "11px 0",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <div>
                <span className="pill" style={{ background: style.bg, color: style.fg }}>
                  {style.label}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {r.href ? (
                    <Link href={r.href} onClick={(e) => e.stopPropagation()} style={{ color: "var(--marigold-deep)", textDecoration: "none" }}>
                      {label} ↗
                    </Link>
                  ) : (
                    label
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--faint)" }}>{typeLabel}</div>
                {line && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{line}</div>}
              </div>
              {showSchool && <div style={{ color: "var(--muted)" }}>{r.schoolName ?? "—"}</div>}
              <div style={{ color: "var(--muted)" }}>{r.actorName ?? "System"}</div>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                {r.when} <span style={{ fontSize: 10.5, color: "var(--faint)" }}>IST</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                <ChangesDetail action={r.action} lines={r.changeLines ?? []} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChangesDetail({ action, lines }: { action: string; lines: AuditChangeLine[] }) {
  if (action === "CREATE") {
    return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>New record created — no earlier values to compare.</div>;
  }
  if (lines.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No field details were recorded for this change.</div>;
  }

  if (action === "DELETE") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Deleted record</div>
        {lines.map((l) => (
          <div key={l.field} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 12 }}>
            <span style={{ color: "var(--muted)" }}>{l.field}</span>
            <span style={{ textAlign: "right" }}>{l.before}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((l) => (
        <div key={l.field} style={{ fontSize: 12.5 }}>
          <div style={{ color: "var(--muted)", marginBottom: 2, fontWeight: 600 }}>{l.field}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="pill" style={{ background: "var(--critical-tint)", color: "var(--critical)" }}>
              {l.before}
            </span>
            <span style={{ color: "var(--faint)" }}>→</span>
            <span className="pill" style={{ background: "var(--good-tint)", color: "var(--good)" }}>
              {l.after}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
