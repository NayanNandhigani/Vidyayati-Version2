"use client";

import { useKeepFormValues } from "@/components/form/useKeepFormValues";
import { useActionState, useState, useTransition } from "react";
import { saveGeneral, type GeneralFormState } from "./actions";
import { FieldError, FormError } from "@/components/form/FormMessages";
import { INDIAN_STATES_AND_UTS, SCHOOL_BOARDS } from "@/lib/indian";
import type { SchoolGeneralValues } from "@/lib/school-fields";
import { updateAdmissionNoPrefix } from "../students/depth-actions";

const initialState: GeneralFormState = {};

export default function GeneralForm({ school, admissionNoPrefix }: { school: SchoolGeneralValues; admissionNoPrefix: string | null }) {
  const [state, formAction, pending] = useActionState(saveGeneral, initialState);
  const keep = useKeepFormValues(state);
  const [prefix, setPrefix] = useState(admissionNoPrefix ?? "");
  const [, startPrefixTransition] = useTransition();
  const v = state.values ?? school;
  const errs = state.fieldErrors ?? {};
  // A state typed before the dropdown existed stays selectable so it isn't lost.
  const legacyState = school.state && !(INDIAN_STATES_AND_UTS as readonly string[]).includes(school.state) ? school.state : null;

  return (
    <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 2 }}>
          School information
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Basic details used across report cards, ID cards and communication.</div>
      </div>
      <form ref={keep.ref} onSubmit={keep.capture} action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <FormError message={state.fieldErrors ? null : state.error} />
        <div className="settings-grid">
          <Field label="School name" error={errs.name} wide>
            <input className="in" name="name" defaultValue={v.name} maxLength={150} />
          </Field>
          <Field label="City" error={errs.city}>
            <input className="in" name="city" defaultValue={v.city} maxLength={80} />
          </Field>
          <Field label="State / UT" error={errs.state}>
            <select className="in" name="state" defaultValue={v.state}>
              <option value="">Choose…</option>
              {legacyState && <option value={legacyState}>{legacyState} (as saved earlier)</option>}
              {INDIAN_STATES_AND_UTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PIN code" error={errs.postalCode}>
            <input className="in mono" name="postalCode" defaultValue={v.postalCode} inputMode="numeric" maxLength={6} placeholder="500001" />
          </Field>
          <Field label="Board" error={errs.affiliationBoard}>
            <select className="in" name="affiliationBoard" defaultValue={v.affiliationBoard}>
              <option value="">Choose…</option>
              {SCHOOL_BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Affiliation number" error={errs.affiliationNumber}>
            <input className="in mono" name="affiliationNumber" defaultValue={v.affiliationNumber} maxLength={40} placeholder="e.g. 3630123" />
          </Field>
          <Field label="UDISE code" error={errs.udiseCode}>
            <input className="in mono" name="udiseCode" defaultValue={v.udiseCode} inputMode="numeric" maxLength={13} placeholder="11 digits" />
          </Field>
          <Field label="School phone" error={errs.phone}>
            <input className="in mono" name="phone" type="tel" defaultValue={v.phone} placeholder="98480 22338 or 040 2345 6789" />
          </Field>
          <Field label="School email" error={errs.email}>
            <input className="in" name="email" type="email" defaultValue={v.email} placeholder="office@school.in" />
          </Field>
        </div>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button type="submit" disabled={pending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: pending ? "default" : "pointer" }}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {state.success && (
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--good)" }}>
              ✓ Saved
            </span>
          )}
        </div>
      </form>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
        <label className="field" style={{ maxWidth: 260 }}>
          Admission number prefix
          <input
            className="in"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onBlur={() => startPrefixTransition(() => updateAdmissionNoPrefix(prefix))}
            placeholder="e.g. STU"
          />
        </label>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
          Used only to pre-fill the "Suggest" button on the New Student form — admission numbers stay freely editable.
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      {label}
      {children}
      <FieldError message={error} />
    </label>
  );
}
