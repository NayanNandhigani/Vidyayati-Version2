"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createStudent } from "../actions";
import { suggestAdmissionNo } from "../depth-actions";
import StudentDetailsFields from "@/components/students/StudentDetailsFields";
import { FieldError, FormError } from "@/components/form/FormMessages";
import { EMPTY_STUDENT_DETAILS, type StudentDetails, type StudentDetailErrors } from "@/lib/student-fields";
import { friendlyError } from "@/lib/friendly-error";

export default function NewStudentForm({ classes, today }: { classes: { id: string; grade: string; section: string }[]; today: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<StudentDetails>(EMPTY_STUDENT_DETAILS);
  const [admissionNo, setAdmissionNo] = useState("");
  const [classId, setClassId] = useState("");
  const [errors, setErrors] = useState<StudentDetailErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const grade = classes.find((c) => c.id === classId)?.grade ?? null;

  function suggest() {
    startTransition(async () => {
      try {
        setAdmissionNo(await suggestAdmissionNo());
      } catch (e) {
        setFormError(friendlyError(e, "Couldn't suggest a number. Please type one."));
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await createStudent(details, admissionNo, classId);
        if (res.studentId) {
          router.push(`/app/students/${res.studentId}?created=1`);
          return;
        }
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error ?? "The student wasn't saved. Please try again.");
      } catch (err) {
        setFormError(friendlyError(err, "The student wasn't saved. Please try again."));
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label className="field">
          Admission number
          <div style={{ display: "flex", gap: 6 }}>
            <input className="in" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} required maxLength={40} placeholder="AD-2050" aria-invalid={!!errors.admissionNo} style={{ flex: 1 }} />
            <button type="button" onClick={suggest} title="Suggest the next number — feel free to edit it" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--marigold-deep)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
              Suggest
            </button>
          </div>
          <FieldError message={errors.admissionNo} />
        </label>
        <label className="field">
          Class
          <select className="in" value={classId} onChange={(e) => setClassId(e.target.value)} required aria-invalid={!!errors.classId}>
            <option value="" disabled>
              Select class
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grade}-{c.section}
              </option>
            ))}
          </select>
          <FieldError message={errors.classId} />
        </label>
      </div>

      <StudentDetailsFields value={details} onChange={setDetails} errors={errors} today={today} grade={grade} />

      <FormError message={formError} />

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={pending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}>
          {pending ? "Saving…" : "Add student"}
        </button>
        <Link href="/app/students" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
