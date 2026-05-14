import { AdminShell } from "@/components/admin/admin-shell";
import { ForceDarkMode } from "@/components/admin/force-dark-mode";
import { InvitedScreen } from "@/components/admin/invited-screen";
import { UnknownErrorScreen } from "@/components/admin/unknown-error-screen";
import { getMe } from "@/lib/api/me";
import { isInvitedError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    const me = await getMe();
    if (me.estado !== "ACTIVO") {
      return (
        <>
          <ForceDarkMode />
          <InvitedScreen />
        </>
      );
    }
    return (
      <>
        <ForceDarkMode />
        <AdminShell me={me}>{children}</AdminShell>
      </>
    );
  } catch (err) {
    if (isInvitedError(err)) {
      return (
        <>
          <ForceDarkMode />
          <InvitedScreen />
        </>
      );
    }
    return (
      <>
        <ForceDarkMode />
        <UnknownErrorScreen message={err instanceof Error ? err.message : String(err)} />
      </>
    );
  }
}
