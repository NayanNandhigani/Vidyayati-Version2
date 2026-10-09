import { auth } from "@/auth";
import PasswordChangeGate from "@/components/PasswordChangeGate";
import { changePassword } from "@/app/app/settings/actions";

export default async function ChangePasswordPage() {
  const session = await auth();
  return <PasswordChangeGate forced={!!session?.user.mustChangePassword} userName={session?.user.name} action={changePassword} redirectTo="/app/dashboard" />;
}
