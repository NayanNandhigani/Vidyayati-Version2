import { auth } from "@/auth";
import PasswordChangeGate from "@/components/PasswordChangeGate";
import { changePassword } from "@/app/super-admin/settings/actions";

export default async function SuperAdminChangePasswordPage() {
  const session = await auth();
  return <PasswordChangeGate forced={!!session?.user.mustChangePassword} userName={session?.user.name} action={changePassword} redirectTo="/super-admin/dashboard" />;
}
