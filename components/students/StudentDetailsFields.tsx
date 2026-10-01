"use client";

import type { StudentDetails, StudentDetailErrors } from "@/lib/student-fields";
import { INDIAN_STATES_AND_UTS, STUDENT_CATEGORIES, BLOOD_GROUPS } from "@/lib/indian";
import { classAgeWarning } from "@/lib/validation";
import { FieldError } from "@/components/form/FormMessages";

// The student detail inputs shared by "Add student" and the profile's
// "Edit details". Controlled, so nothing typed is ever lost when the
// server rejects a save.

const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "6px 0 -4px" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const optional = <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>;

export default function StudentDetailsFields({
  value,
  onChange,
  errors,
  today,
  grade,
  aadhaarOnFile,
  compact,
}: {
  value: StudentDetails;
  onChange: (next: StudentDetails) => void;
  errors: StudentDetailErrors;
  today: string;
  grade: string | null; // the class the student is (or will be) in, for the age check
  aadhaarOnFile?: string | null; // masked number already saved, on edit
  compact?: boolean;
}) {
  const set = <K extends keyof StudentDetails>(key: K, v: StudentDetails[K]) => onChange({ ...value, [key]: v });
  const fs = compact ? 12 : 13.5;
  const ageWarning = value.dob && grade ? classAgeWarning(value.dob, grade) : null;

  const text = (key: keyof StudentDetails, label: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      {label}
      <input className="in" value={String(value[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} aria-invalid={!!errors[key]} style={{ fontSize: fs }} {...props} />
      <FieldError message={errors[key]} />
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid2}>
        {text("firstName", "First name", { required: true, maxLength: 80, placeholder: "Aarav" })}
        {text("surname", "Surname", { required: true, maxLength: 80, placeholder: "Mehta" })}
      </div>
      <div style={grid2}>
        <label className="field">
          Date of birth {optional}
          <input className="in mono" type="date" max={today} value={value.dob} onChange={(e) => set("dob", e.target.value)} aria-invalid={!!errors.dob} style={{ fontSize: fs }} />
          <FieldError message={errors.dob} />
          {!errors.dob && ageWarning && <span style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 600, color: "var(--warn)" }}>{ageWarning}</span>}
        </label>
        <label className="field">
          Gender {optional}
          <select className="in" value={value.gender} onChange={(e) => set("gender", e.target.value as StudentDetails["gender"])} style={{ fontSize: fs }}>
            <option value="">Not specified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>

      <div style={sectionTitle}>Parents / guardian</div>
      <div style={grid2}>
        {text("fatherName", <>Father&apos;s name {optional}</>)}
        {text("motherName", <>Mother&apos;s name {optional}</>)}
        {text("guardianName", <>Guardian&apos;s name {optional}</>)}
      </div>
      <div style={grid2}>
        {text("primaryMobile", <>Primary mobile {optional}</>, { inputMode: "tel", placeholder: "98765 43210" })}
        {text("email", <>Email {optional}</>, { type: "email", placeholder: "parent@example.com" })}
      </div>

      <div style={sectionTitle}>Address</div>
      <label className="field">
        Address {optional}
        <textarea className="in" rows={2} value={value.address} onChange={(e) => set("address", e.target.value)} style={{ fontSize: fs }} />
      </label>
      <div style={grid2}>
        <label className="field">
          State {optional}
          <select className="in" value={value.state} onChange={(e) => set("state", e.target.value)} aria-invalid={!!errors.state} style={{ fontSize: fs }}>
            <option value="">Select state / UT</option>
            {INDIAN_STATES_AND_UTS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <FieldError message={errors.state} />
        </label>
        {text("pinCode", <>PIN code {optional}</>, { inputMode: "numeric", maxLength: 6, placeholder: "560001" })}
      </div>

      <div style={sectionTitle}>Identity &amp; admission</div>
      <div style={grid2}>
        {text("aadhaarNumber", <>Aadhaar number {optional}</>, {
          inputMode: "numeric",
          maxLength: 14,
          autoComplete: "off",
          placeholder: aadhaarOnFile ? `${aadhaarOnFile} (leave blank to keep)` : "1234 5678 9012",
        })}
        {text("apaarId", <>APAAR ID {optional}</>, { inputMode: "numeric", maxLength: 14 })}
      </div>
      <div style={grid2}>
        <label className="field">
          Category {optional}
          <select className="in" value={value.category} onChange={(e) => set("category", e.target.value as StudentDetails["category"])} style={{ fontSize: fs }}>
            <option value="">Not specified</option>
            {STUDENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {text("religion", <>Religion {optional}</>)}
        <label className="field">
          Blood group {optional}
          <select className="in" value={value.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} aria-invalid={!!errors.bloodGroup} style={{ fontSize: fs }}>
            <option value="">Not specified</option>
            {BLOOD_GROUPS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {value.bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(value.bloodGroup) && <option value={value.bloodGroup}>{value.bloodGroup}</option>}
          </select>
          <FieldError message={errors.bloodGroup} />
        </label>
      </div>
      <div style={grid2}>
        {text("previousSchoolName", <>Previous school {optional}</>)}
        <label className="field">
          Admission date {optional}
          <input className="in mono" type="date" max={today} value={value.admissionDate} onChange={(e) => set("admissionDate", e.target.value)} aria-invalid={!!errors.admissionDate} style={{ fontSize: fs }} />
          <FieldError message={errors.admissionDate} />
        </label>
        {text("rollNumber", <>Roll number {optional}</>)}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs }}>
        <input type="checkbox" checked={value.rteQuota} onChange={(e) => set("rteQuota", e.target.checked)} />
        Admitted under the RTE quota
      </label>
      <label className="field">
        Medical notes {optional}
        <textarea className="in" rows={2} value={value.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} placeholder="Allergies, conditions" style={{ fontSize: fs }} />
      </label>
    </div>
  );
}
