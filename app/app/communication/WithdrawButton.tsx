"use client";

import { useState, useTransition } from "react";
import { withdrawAnnouncement } from "./actions";

export default function WithdrawButton({ id, withdrawn }: { id: string; withdrawn: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (withdrawn) {
    return (
      <span className="pill" style={{ background: "var(--critical-tint)", color: "var(--critical)", fontSize: 10.5 }}>
        Withdrawn
      </span>
    );
  }

  function click() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(() => withdrawAnnouncement(id));
  }

  return (
    <span onClick={click} style={{ fontSize: 11, fontWeight: 700, color: "var(--critical)", cursor: pending ? "default" : "pointer" }}>
      {pending ? "Withdrawing…" : confirming ? "Confirm withdraw?" : "Withdraw"}
    </span>
  );
}
