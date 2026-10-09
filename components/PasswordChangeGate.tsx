import ChangePasswordForm, { type ChangePasswordFormState } from "@/components/ChangePasswordForm";
import { signOutAction } from "@/app/app/actions";

// The change-password screen. When the account must set its own password
// (first sign-in, or after an admin reset) it's a popup over the dimmed
// portal that can't be dismissed: middleware.ts sends every page and action
// here until the password is changed, so nothing else can be used first.
// Otherwise it's the ordinary "Change password" card.
export default function PasswordChangeGate({
  forced,
  userName,
  action,
  redirectTo,
}: {
  forced: boolean;
  userName: string | null | undefined;
  action: (prevState: ChangePasswordFormState, formData: FormData) => Promise<ChangePasswordFormState>;
  redirectTo: string;
}) {
  const card = (
    <div className="card" style={{ padding: 28, width: "100%", maxWidth: 440, boxSizing: "border-box" }}>
      <div className="disp" style={{ fontSize: 20, marginBottom: 4 }} id="pw-title">
        {forced ? "Set your own password" : "Change password"}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Signed in as {userName}</div>
      <ChangePasswordForm action={action} redirectTo={redirectTo} forced={forced} />
      {forced && (
        <form action={signOutAction} style={{ marginTop: 14 }}>
          <button type="submit" style={{ background: "none", border: "none", padding: 0, color: "var(--muted)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
            Not you? Sign out
          </button>
        </form>
      )}
    </div>
  );

  if (!forced) {
    return (
      <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "var(--page-h, 100dvh)", boxSizing: "border-box" }}>
        {card}
      </div>
    );
  }

  return (
    <div className="pw-gate" role="dialog" aria-modal="true" aria-labelledby="pw-title">
      {card}
    </div>
  );
}
