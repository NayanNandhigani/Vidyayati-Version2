"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadSchoolLogo, removeSchoolLogo } from "./actions";
import { FormError, SuccessBanner } from "@/components/form/FormMessages";
import { MAX_LOGO_BYTES } from "@/lib/school-branding";
import { friendlyError } from "@/lib/friendly-error";

// The logo shown at the start of the portal header, next to the school name.
export default function SchoolLogoPanel({ logoUrl, initials }: { logoUrl: string | null; initials: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(file: File | undefined) {
    setError(null);
    setDone(null);
    if (!file) return;
    // Checked here too so a big file gets this message instead of the upload being refused outright.
    if (file.size > MAX_LOGO_BYTES) {
      setError("The logo must be 1 MB or smaller.");
      return;
    }
    const data = new FormData();
    data.append("logo", file);
    start(async () => {
      try {
        const res = await uploadSchoolLogo(data);
        if (res.error) setError(res.error);
        else {
          setDone("Logo updated — it now shows in the header.");
          router.refresh();
        }
      } catch (err) {
        setError(friendlyError(err));
      }
      if (input.current) input.current.value = "";
    });
  }

  function remove() {
    setError(null);
    setDone(null);
    start(async () => {
      try {
        const res = await removeSchoolLogo();
        if (res.error) setError(res.error);
        else {
          setDone("Logo removed — the header shows the school's initials.");
          router.refresh();
        }
      } catch (err) {
        setError(friendlyError(err));
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>
        School logo
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="app-school-logo" style={{ width: 64, height: 64, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the school's uploaded logo
            <img src={logoUrl} alt="Current school logo" style={{ padding: 6, boxSizing: "border-box" }} />
          ) : (
            <span className="app-school-initials">{initials}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ background: "var(--marigold)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}>
              {pending ? "Saving…" : logoUrl ? "Change logo" : "Upload logo"}
              <input ref={input} type="file" name="logo" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={(e) => upload(e.target.files?.[0])} style={{ display: "none" }} />
            </label>
            {logoUrl && (
              <button type="button" onClick={remove} disabled={pending} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "var(--critical)", cursor: "pointer" }}>
                Remove
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>PNG, JPG or WebP, up to 1 MB. A square image looks best. Shown in the header for staff, parents and admins.</div>
        </div>
      </div>
      <FormError message={error} />
      <SuccessBanner message={done} />
    </div>
  );
}
