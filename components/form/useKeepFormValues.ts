"use client";

import { useEffect, useRef } from "react";

// React 19 clears a <form action={…}> after every submission — including a
// rejected one, so the user loses everything they typed and only sees the
// error. This hook snapshots the form's values on submit and, when the
// server answers with an error, puts them back.
//
//   const keep = useKeepFormValues(state);
//   <form ref={keep.ref} onSubmit={keep.capture} action={formAction}>

type Snapshot = Map<string, string[]>;

function restore(form: HTMLFormElement, snap: Snapshot) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || !snap.has(el.name)) continue;
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file" || el.type === "submit" || el.type === "password")) continue;
    const values = snap.get(el.name)!;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = values.includes(el.value);
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      for (const opt of Array.from(el.options)) opt.selected = values.includes(opt.value);
    } else {
      el.value = values[0] ?? "";
    }
  }
}

export function useKeepFormValues(state: { error?: string | null } | null | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  const snapshot = useRef<Snapshot | null>(null);

  function capture() {
    const form = ref.current;
    if (!form) return;
    const snap: Snapshot = new Map();
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value !== "string") continue;
      snap.set(name, [...(snap.get(name) ?? []), value]);
    }
    // Unchecked checkboxes don't appear in FormData; remember them as empty.
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name && !snap.has(el.name)) snap.set(el.name, []);
    }
    snapshot.current = snap;
  }

  useEffect(() => {
    const form = ref.current;
    const snap = snapshot.current;
    if (!form || !snap || !state?.error) return;
    // React's own reset lands in the same commit; restore just after it.
    const id = requestAnimationFrame(() => restore(form, snap));
    return () => cancelAnimationFrame(id);
  }, [state]);

  return { ref, capture };
}
