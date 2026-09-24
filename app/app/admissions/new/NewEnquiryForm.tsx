"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createEnquiry, type EnquiryFormState } from "../actions";

const initialState: EnquiryFormState = {};

export default function NewEnquiryForm({ grades }: { grades: string[] }) {
  const [state, formAction, pending] = useActionState(createEnquiry, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
      <label className="field">
        Applicant name
        <input className="in" name="applicantName" required placeholder="Priya Nair" />
      </label>
      <label className="field">
        Date of birth
        <input className="in mono" name="dob" type="date" />
      </label>
      <label className="field">
        Gender
        <select className="in" name="gender" defaultValue="">
          <option value="">—</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="field">
        Parent name
        <input className="in" name="parentName" placeholder="Ravi Nair" />
      </label>
      <label className="field">
        Contact number
        <input className="in mono" name="parentContact" required placeholder="+91 98XXXXXXXX" />
      </label>
      <label className="field">
        Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <input className="in" name="email" type="email" placeholder="parent@example.com" />
      </label>
      <label className="field">
        Address
        <textarea className="in" name="address" rows={2} />
      </label>
      <label className="field">
        Class applying for
        <select className="in" name="classApplied" required defaultValue="">
          <option value="" disabled>
            Select a class
          </option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Class {g}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Enquiry source <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <select className="in" name="enquirySource" defaultValue="">
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
        <input className="in mono" name="followUpDate" type="date" />
      </label>
      <label className="field">
        Notes <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <textarea className="in" name="notes" rows={2} />
      </label>

      {state.error && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--critical)", background: "var(--critical-tint)", border: "1px solid var(--critical-border)", borderRadius: 8, padding: "8px 11px" }}>
          {state.error}
        </p>
      )}

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
