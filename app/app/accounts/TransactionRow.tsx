"use client";

import { useState, useTransition } from "react";
import { formatIST } from "@/lib/ist";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";
import { updateManualTransaction, deleteManualTransaction, type ManualTransactionFields } from "./depth-actions";

const AUTO_SOURCE_LABEL: Record<string, string> = {
  AUTO_FEES: "Fee payment",
  AUTO_PAYROLL: "Payroll",
  AUTO_LIBRARY_FINE: "Library fine",
  AUTO_INVENTORY_PURCHASE: "Inventory purchase",
};

type Txn = { id: string; date: string; description: string; category: string | null; source: string; type: "INCOME" | "EXPENSE"; amount: number; balance: number };

export default function TransactionRow({ t, canEdit }: { t: Txn; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [fields, setFields] = useState<ManualTransactionFields>({ date: t.date.slice(0, 10), description: t.description, category: t.category ?? "", amount: t.amount, type: t.type });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isManual = t.source === "MANUAL";

  function save() {
    startTransition(async () => {
      const res = await updateManualTransaction(t.id, fields);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setEditing(false);
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
      await deleteManualTransaction(t.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 20px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: 6 }}>
          <input className="in mono" type="date" value={fields.date} onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))} style={{ fontSize: 11.5 }} />
          <input className="in" value={fields.description} onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))} style={{ fontSize: 11.5 }} />
          <input className="in" value={fields.category} onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))} style={{ fontSize: 11.5 }} />
          <input className="in mono" type="number" min={0} value={fields.amount} onChange={(e) => setFields((f) => ({ ...f, amount: Number(e.target.value) }))} style={{ fontSize: 11.5 }} />
        </div>
        {error && <div style={{ fontSize: 11, color: "var(--critical)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={save} disabled={pending} style={{ fontSize: 11, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ fontSize: 11, fontWeight: 600, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="acc-ledger-row" style={{ alignItems: "center", padding: "8px 20px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
      <div className="mono" style={{ color: "var(--faint)" }}>
        {formatIST(t.date, { day: "2-digit", month: "short" })}
      </div>
      <div>
        {t.description}
        {canEdit && isManual && (
          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700 }}>
            <span onClick={() => setEditing(true)} style={{ color: "var(--marigold-deep)", cursor: "pointer" }}>
              Edit
            </span>{" "}
            ·{" "}
            <span onClick={doDelete} style={{ color: "var(--critical)", cursor: "pointer" }}>
              {confirmingDelete ? "Confirm?" : "Delete"}
            </span>
          </span>
        )}
      </div>
      <div style={{ color: "var(--muted)" }}>{t.category ?? "—"}</div>
      <div>
        {isManual ? (
          <span style={{ color: "var(--faint)", fontWeight: 600, fontSize: 11.5 }}>Manual</span>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 100, background: "#EDEFF4", color: "var(--ink2)" }}>
            Auto: {AUTO_SOURCE_LABEL[t.source] ?? "Payroll"}
          </span>
        )}
      </div>
      <div className="mono" style={{ textAlign: "right", fontWeight: 600, color: t.type === "INCOME" ? "var(--teal)" : "var(--clay)" }}>
        {t.type === "INCOME" ? "+" : "−"}
        {formatINR(t.amount)}
      </div>
      <div className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
        {formatINR(t.balance)}
      </div>
    </div>
  );
}
