import { ClockIcon } from "@heroicons/react/24/outline";
import { signOut } from "@/app/actions/auth";

export function InvitedScreen() {
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
