"use client";

import { useKeepFormValues } from "@/components/form/useKeepFormValues";
import { useActionState } from "react";
import Link from "next/link";
import { createEnquiry, type EnquiryFormState } from "../actions";
import { FieldError, FormError } from "@/components/form/FormMessages";

const initialState: EnquiryFormState = {};

export default function NewEnquiryForm({ grades, today }: { grades: string[]; today: string }) {
  const [state, formAction, pending] = useActionState(createEnquiry, initialState);
  const keep = useKeepFormValues(state);
  // React clears a form after each submit. Remounting it (key) with the
  // submitted values as defaults keeps everything the user typed —
  // including dropdowns — when the server rejects it.
  const v = state.values;
  const fe = state.fieldErrors ?? {};

  return (
    <form key={state.attempt ?? 0} ref={keep.ref} onSubmit={keep.capture} action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
      <label className="field">
        Applicant name
        <input className="in" name="applicantName" required maxLength={120} placeholder="Priya Nair" defaultValue={v?.applicantName} aria-invalid={!!fe.applicantName} />
        <FieldError message={fe.applicantName} />
      </label>
      <label className="field">
        Date of birth
        <input className="in mono" name="dob" type="date" max={today} defaultValue={v?.dob} aria-invalid={!!fe.dob} />
        <FieldError message={fe.dob} />
      </label>
      <label className="field">
        Gender
        <select className="in" name="gender" defaultValue={v?.gender ?? ""}>
          <option value="">—</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="field">
        Parent name
        <input className="in" name="parentName" placeholder="Ravi Nair" defaultValue={v?.parentName} />
      </label>
      <label className="field">
        Contact number
        <input className="in mono" name="parentContact" required inputMode="tel" placeholder="98765 43210" defaultValue={v?.parentContact} aria-invalid={!!fe.parentContact} />
        <FieldError message={fe.parentContact} />
      </label>
      <label className="field">
        Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <input className="in" name="email" type="email" placeholder="parent@example.com" defaultValue={v?.email} aria-invalid={!!fe.email} />
        <FieldError message={fe.email} />
      </label>
      <label className="field">
        Address
        <textarea className="in" name="address" rows={2} defaultValue={v?.address} />
      </label>
      <label className="field">
        Class applying for
        <select className="in" name="classApplied" required defaultValue={v?.classApplied ?? ""} aria-invalid={!!fe.classApplied}>
          <option value="" disabled>
            Select a class
          </option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Class {g}
            </option>
          ))}
        </select>
        <FieldError message={fe.classApplied} />
      </label>
      <label className="field">
        Enquiry source <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <select className="in" name="enquirySource" defaultValue={v?.enquirySource ?? ""}>
          <option value="">—</option>
          <option>Walk-in</option>
          <option>Referral</option>
          <option>Website</option>
          <option>Phone</option>
          <option>Other</option>
        </select>
      </label>
      <label className="field">
        Follow-up date <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <input className="in mono" name="followUpDate" type="date" defaultValue={v?.followUpDate} aria-invalid={!!fe.followUpDate} />
        <FieldError message={fe.followUpDate} />
      </label>
      <label className="field">
        Notes <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <textarea className="in" name="notes" rows={2} defaultValue={v?.notes} />
      </label>

      <FormError message={state.error} />

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={pending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}>
          {pending ? "Saving…" : "Add enquiry"}
        </button>
        <Link href="/app/admissions" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
