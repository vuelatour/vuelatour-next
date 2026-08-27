import { AdminShell } from "@/components/admin/admin-shell";
import { ForceDarkMode } from "@/components/admin/force-dark-mode";
import { InvitedScreen } from "@/components/admin/invited-screen";
import { VisitanteScreen } from "@/components/admin/visitante-screen";
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
    // El VISITANTE opera SOLO desde la app móvil (el API igual le niega los
    // datos, pero un panel vacío confunde — mejor una pantalla clara).
    if (me.rol === "VISITANTE") {
      return (
        <>
          <ForceDarkMode />
          <VisitanteScreen />
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
