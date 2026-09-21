import { signOut } from "@/app/actions/auth";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { DatosSoporte } from "@/components/admin/datos-soporte";

/**
 * El layout del panel no pudo leer `/v1/me`, así que NINGUNA pantalla de
 * `/admin` se puede pintar.
 *
 * Antes decía «Algo salió mal» con el mensaje crudo del API (en inglés) y la
 * única salida era **Cerrar sesión** — un consejo equivocado: la causa casi
 * siempre es el API reiniciándose (502/503 de Railway durante un deploy) y
 * cerrar la sesión no arregla nada, solo obliga a volver a entrar.
 * Desde el 21-sep-2026 la salida principal es **Reintentar**; cerrar sesión
 * queda abajo, para cuando de verdad el problema es la sesión.
 *
 * Con el API caído del todo ESTA es la única pantalla que el operador llega a
 * ver (ninguna página alcanza su propio error boundary: el layout falla
 * antes), así que lleva los MISMOS datos para soporte que el boundary —
 * detalle, hora de Cancún y pantalla—. Medido con el arnés el 21-sep-2026.
 */
export function UnknownErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <TarjetaErrorCarga
          titulo="No pudimos cargar el panel"
          descripcion={
            <>
              Suele ser momentáneo (por ejemplo, mientras el sistema se actualiza). Pulsa
              Reintentar; si sigue igual después de unos minutos, manda estos datos a
              sistemas:
              <div className="mt-3">
                <DatosSoporte codigo={message} etiquetaCodigo="Detalle" />
              </div>
            </>
          }
        />
        <form action={signOut} className="text-center">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Cerrar sesión e intentar de nuevo
          </button>
        </form>
      </div>
    </main>
  );
}
