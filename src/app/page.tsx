import { ClockIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { apiServer } from "@/lib/api/server";
import { isInvitedError } from "@/lib/api/errors";
import { signOut } from "./actions/auth";
import type { MeResponse } from "@/types/me";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let me: MeResponse;
  try {
    me = await apiServer<MeResponse>("/v1/me");
  } catch (err) {
    if (isInvitedError(err)) {
      return <InvitedScreen />;
    }
    return <UnknownErrorScreen message={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="vt-card p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Bienvenido</p>
              <h1 className="text-2xl font-semibold">{me.nombre}</h1>
              <p className="text-sm text-muted-foreground">{me.email}</p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              {me.rol}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Estado</p>
              <p className="font-medium">{me.estado}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fondo de caja</p>
              <p className="font-medium">{me.tiene_fondo_caja ? "Sí" : "No"}</p>
            </div>
            {me.tarjeta_terminacion && (
              <div>
                <p className="text-muted-foreground">Tarjeta corp.</p>
                <p className="font-medium">**** {me.tarjeta_terminacion}</p>
              </div>
            )}
            {me.telefono && (
              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p className="font-medium">{me.telefono}</p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Esta vista es temporal. El dashboard completo con sidebar viene en FRONT 3.
        </p>
      </div>
    </main>
  );
}

function InvitedScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="vt-card p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <ClockIcon className="h-7 w-7 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Cuenta pendiente de activación</h1>
            <p className="text-sm text-muted-foreground">
              Tu acceso quedó registrado pero un administrador necesita asignarte un rol antes de
              que puedas usar el sistema.
            </p>
            <p className="text-sm text-muted-foreground">
              Avisa a Diego o al admin de Aero Charter Cancún para que te active.
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function UnknownErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="vt-card p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Algo salió mal</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Cerrar sesión e intentar de nuevo
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
