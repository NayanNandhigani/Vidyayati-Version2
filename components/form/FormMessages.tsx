// Shared form feedback: a message under a field, a summary above the
// buttons, and a success banner. Every form uses these so errors look and
// read the same everywhere.

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <span role="alert" style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 600, color: "var(--critical)" }}>
      {message}
    </span>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--critical)", background: "var(--critical-tint)", border: "1px solid var(--critical-border)", borderRadius: 8, padding: "8px 11px" }}>
      {message}
    </p>
  );
}

export function FormWarning({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--warn)", background: "var(--warn-tint, #fff8e6)", border: "1px solid var(--warn-border, #f1d38a)", borderRadius: 8, padding: "8px 11px" }}>
      {message}
    </p>
  );
}

export function SuccessBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" style={{ fontSize: 13, fontWeight: 600, color: "var(--good)", background: "var(--good-tint, #e9f7ef)", border: "1px solid var(--good-border, #b7e3c8)", borderRadius: 8, padding: "9px 12px" }}>
      {message}
    </div>
  );
}
