import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { signOut } from "@/app/actions/auth";

/** Pantalla para rol VISITANTE: el panel admin no es para ellos — su flujo
 *  completo (registrar gastos con su fondo/tarjeta) vive en la app móvil. */
export function VisitanteScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="vt-card p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <DevicePhoneMobileIcon className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Tu cuenta es de visitante</h1>
            <p className="text-sm text-muted-foreground">
              Usa la app móvil de VuelaTour para registrar tus gastos y consultar tu fondo. Este
              panel es solo para el equipo de oficina.
            </p>
            <p className="text-sm text-muted-foreground">
              Si crees que necesitas otro acceso, avisa a Diego o al admin de Aero Charter Cancún.
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
