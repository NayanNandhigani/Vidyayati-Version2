"use client";

import { useKeepFormValues } from "@/components/form/useKeepFormValues";
import { useActionState, useState, useTransition } from "react";
import { createGradeScale, setActiveGradeScale, createGradeBand, deleteGradeBand, addPresetGradeScale, saveExamFailLabel, type FormState } from "./actions";
import { GRADE_SCALE_PRESETS } from "@/lib/grade-scales";
import { DEFAULT_FAIL_LABEL } from "@/lib/exam-rules";
import { toast } from "@/components/Toaster";
import { friendlyError } from "@/lib/friendly-error";

type Band = { id: string; label: string; minPercent: number; maxPercent: number; remark: string | null };
type Scale = { id: string; name: string; isActive: boolean; bands: Band[] };

const initialState: FormState = {};

export default function GradingPanel({ scales, failLabel: initialFailLabel }: { scales: Scale[]; failLabel: string }) {
  const [failLabel, setFailLabel] = useState(initialFailLabel);
  const [showScaleForm, setShowScaleForm] = useState(false);
  const [showBandForm, setShowBandForm] = useState(false);
  const [scaleState, scaleAction, scalePending] = useActionState(createGradeScale, initialState);
  const keep1 = useKeepFormValues(scaleState);
  const [bandState, bandAction, bandPending] = useActionState(createGradeBand, initialState);
  const keep2 = useKeepFormValues(bandState);
  const [, startTransition] = useTransition();

  const activeScale = scales.find((s) => s.isActive) ?? scales[0];

  function activate(id: string) {
    startTransition(async () => {
      await setActiveGradeScale(id);
    });
  }

  function applyPreset(key: string) {
    startTransition(async () => {
      try {
        const res = await addPresetGradeScale(key, true);
        if (res.error) toast.error(res.error);
        else toast.success("Grade scale is now active. This year's exam results were recalculated.");
      } catch (e) {
        toast.error(friendlyError(e));
      }
    });
  }

  function saveFailLabel() {
    startTransition(async () => {
      try {
        const res = await saveExamFailLabel(failLabel);
        if (res.error) toast.error(res.error);
        else toast.success("Saved.");
      } catch (e) {
        toast.error(friendlyError(e));
      }
    });
  }

  function removeBand(id: string) {
    startTransition(async () => {
      await deleteGradeBand(id);
    });
  }

  return (
    <div style={{ maxWidth: 640, width: "100%" }}>
      <div style={{ marginBottom: 16 }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 2 }}>
          Grading
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Pick a built-in scale or build your own for report cards. Without one, the Simple A+ to E scale is used.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, padding: "12px 14px", background: "var(--paper)", borderRadius: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Built-in scales</div>
        {GRADE_SCALE_PRESETS.map((p) => (
          <div key={p.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{p.bands.map((b) => `${b.label} ${b.minPercent === 0 ? `below ${p.bands[p.bands.length - 2]!.minPercent}` : `${b.minPercent}–${b.maxPercent}`}`).join(" · ")}</div>
            </div>
            <button type="button" onClick={() => applyPreset(p.key)} style={{ flex: "none", fontSize: 12, fontWeight: 700, background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              Use this scale
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 16 }}>
        <label className="field" style={{ flex: 1 }}>
          Result shown when a subject is failed
          <input className="in" value={failLabel} onChange={(e) => setFailLabel(e.target.value)} placeholder={DEFAULT_FAIL_LABEL} maxLength={40} />
        </label>
        <button type="button" onClick={saveFailLabel} style={{ fontSize: 12, fontWeight: 700, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 12px", cursor: "pointer" }}>
          Save
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {scales.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="pill" style={{ background: s.isActive ? "var(--good-tint)" : "var(--line)", color: s.isActive ? "var(--good)" : "var(--faint)" }}>
                {s.isActive ? "Active" : "Inactive"}
              </span>
              {!s.isActive && (
                <span onClick={() => activate(s.id)} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--marigold-deep)", cursor: "pointer" }}>
                  Set as active
                </span>
              )}
            </div>
          </div>
        ))}
        {scales.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No grade scales configured yet.</div>}
      </div>

      {showScaleForm ? (
        <form ref={keep1.ref} onSubmit={keep1.capture} action={scaleAction} style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <label className="field">
            Scale name
            <input className="in" name="name" placeholder="e.g. CBSE 10-point" required />
          </label>
          {scaleState.error && <div style={{ color: "var(--critical)", fontSize: 12.5 }}>{scaleState.error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={scalePending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {scalePending ? "Adding…" : "Add scale"}
            </button>
            <span onClick={() => setShowScaleForm(false)} style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", cursor: "pointer", padding: "8px 4px" }}>
              Cancel
            </span>
          </div>
        </form>
      ) : (
        <span onClick={() => setShowScaleForm(true)} style={{ display: "inline-block", marginBottom: 20, fontSize: 13, fontWeight: 600, color: "var(--marigold-deep)", cursor: "pointer" }}>
          + Add grade scale
        </span>
      )}

      {activeScale && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 10 }}>
            Bands — {activeScale.name}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {activeScale.bands.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No bands defined yet.</div>}
            {[...activeScale.bands].sort((a, b) => b.minPercent - a.minPercent).map((b) => (
              <div key={b.id} className="m-row" style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1.4fr auto", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--paper)", borderRadius: 8, fontSize: 12.5 }}>
                <span style={{ fontWeight: 700 }}>{b.label}</span>
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {b.minPercent}–{b.maxPercent}%
                </span>
                <span style={{ color: "var(--faint)" }}>{b.remark ?? "—"}</span>
                <span onClick={() => removeBand(b.id)} style={{ color: "var(--critical)", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>
                  Remove
                </span>
              </div>
            ))}
          </div>

          {showBandForm ? (
            <form ref={keep2.ref} onSubmit={keep2.capture} action={bandAction} style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: 16 }}>
              <input type="hidden" name="scaleId" value={activeScale.id} />
              <div className="m-row" style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 1.5fr", gap: 10 }}>
                <label className="field">
                  Label
                  <input className="in" name="label" placeholder="A1" required />
                </label>
                <label className="field">
                  Min %
                  <input className="in mono" type="number" name="minPercent" min={0} max={100} required />
                </label>
                <label className="field">
                  Max %
                  <input className="in mono" type="number" name="maxPercent" min={0} max={100} required />
                </label>
                <label className="field">
                  Remark
                  <input className="in" name="remark" placeholder="Outstanding" />
                </label>
              </div>
              {bandState.error && <div style={{ color: "var(--critical)", fontSize: 12.5 }}>{bandState.error}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={bandPending} style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {bandPending ? "Adding…" : "Add band"}
                </button>
                <span onClick={() => setShowBandForm(false)} style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", cursor: "pointer", padding: "8px 4px" }}>
                  Cancel
                </span>
              </div>
            </form>
          ) : (
            <span onClick={() => setShowBandForm(true)} style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: "var(--marigold-deep)", cursor: "pointer" }}>
              + Add band
            </span>
          )}
        </div>
      )}
    </div>
  );
}
