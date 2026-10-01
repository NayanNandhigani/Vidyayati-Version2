"use client";

import { useKeepFormValues } from "@/components/form/useKeepFormValues";
import { useActionState, useEffect, useState } from "react";
import { addTransaction, type TransactionFormState } from "./actions";
import { FieldError, FormError, SuccessBanner } from "@/components/form/FormMessages";
import { todayIST } from "@/lib/ist";

const initialState: TransactionFormState = {};

const EXPENSE_CATEGORIES = ["Maintenance", "Utilities", "Supplies", "Events", "Facilities", "Transport", "Other"];
const INCOME_CATEGORIES = ["Fees", "Donations", "Grants", "Rent", "Other income"];

export default function AddTransactionPanel() {
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [state, formAction, pending] = useActionState(addTransaction, initialState);
  const keep = useKeepFormValues(state);

  const categories = type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [category, setCategory] = useState(categories[0]);

  function changeType(next: "INCOME" | "EXPENSE") {
    setType(next);
    setCategory((next === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0]);
  }

  const v = state.success ? undefined : state.values;
  const fe = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.success) {
      setCategory(EXPENSE_CATEGORIES[0]);
      setType("EXPENSE");
    }
  }, [state.success, state.attempt]);

  return (
    <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 15 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Add transaction</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Manual entries only — fee payments and payroll sync in automatically</div>
      </div>

      <div style={{ display: "flex", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: 3 }}>
        <span
          onClick={() => changeType("INCOME")}
          style={{ flex: 1, textAlign: "center", padding: 7, borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: type === "INCOME" ? "var(--teal)" : "transparent", color: type === "INCOME" ? "#fff" : "var(--faint)" }}
        >
          Income
        </span>
        <span
          onClick={() => changeType("EXPENSE")}
          style={{ flex: 1, textAlign: "center", padding: 7, borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: type === "EXPENSE" ? "var(--clay)" : "transparent", color: type === "EXPENSE" ? "#fff" : "var(--faint)" }}
        >
          Expense
        </span>
      </div>

      <SuccessBanner message={state.success ? state.savedMessage : null} />
      {/* Remounted after every submit: a success starts a fresh form; a
          rejection refills it with what was typed (server messages below
          each field — the browser's own checks are off so they always show). */}
      <form key={state.attempt ?? 0} ref={keep.ref} onSubmit={keep.capture} action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input type="hidden" name="type" value={type} />
        <label className="field">
          Date
          <input className="in mono" name="date" type="date" defaultValue={v?.date ?? todayIST()} aria-invalid={!!fe.date} />
          <FieldError message={fe.date} />
        </label>
        <label className="field">
          Description
          <input className="in" name="description" type="text" maxLength={200} placeholder="Generator fuel — August" defaultValue={v?.description} aria-invalid={!!fe.description} />
          <FieldError message={fe.description} />
        </label>
        <label className="field">
          Category
          <select className="in" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Amount
          <input className="in mono" name="amount" type="text" inputMode="decimal" placeholder="0" defaultValue={v?.amount} aria-invalid={!!fe.amount} />
          <FieldError message={fe.amount} />
        </label>

        <FormError message={state.error} />

        <button
          type="submit"
          disabled={pending}
          style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 13.5, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Adding…" : "Add Transaction"}
        </button>
      </form>
    </div>
  );
}
