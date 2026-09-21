"use client";

import { useEffect } from "react";
import { ArrowPathIcon, ExclamationTriangleIcon, HomeIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatosSoporte } from "@/components/admin/datos-soporte";
import {
  BOTON_INICIO,
  BOTON_REINTENTAR,
  MENSAJE_ERROR,
  TITULO_ERROR,
  codigoDeError,
} from "@/lib/admin/pantalla-error";

interface PantallaErrorProps {
  error: Error & { digest?: string };
  /**
   * Qué hace «Reintentar». Los boundaries pasan el `unstable_retry` de Next,
   * NO su `reset`: la documentación de esta versión es explícita —«reset()
   * solo limpia el estado de error y vuelve a renderizar SIN volver a pedir
   * los datos, así que no se recupera de errores de Server Components»— y
   * todos los fallos que motivaron esta pantalla (el API en su ventana de
   * deploy) son justo eso. Con `reset` el botón se veía funcionar y volvía a
   * pintar el mismo error.
   */
  reintentar: () => void;
  /** A dónde manda «Volver al inicio» (el panel: /admin). */
  inicio?: string;
}

/**
 * Lo que ve el operador cuando una pantalla del panel no cargó (21-sep-2026).
 * El mensaje EN INGLÉS de Next nunca se pinta: solo el código (digest), la
 * hora de Cancún y la ruta, que es lo que sistemas necesita para buscarlo en
 * los logs. El error completo sigue yendo a la consola del navegador.
 */
export function PantallaError({ error, reintentar, inicio = "/admin" }: PantallaErrorProps) {
  useEffect(() => {
    // Log completo para devs/soporte; en prod podría ir también a Sentry.
    console.error("[admin] error de pantalla", error);
  }, [error]);

  const codigo = codigoDeError(error);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-amber-500/15 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <CardTitle>{TITULO_ERROR}</CardTitle>
          <p className="text-sm text-muted-foreground">{MENSAJE_ERROR}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mismos datos, misma fuente, que la pantalla del layout. */}
          <DatosSoporte codigo={codigo} />
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={reintentar}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ArrowPathIcon className="h-4 w-4" />
              {BOTON_REINTENTAR}
            </button>
            {/* Navegación DURA (no <Link>): si el árbol de React quedó en mal
                estado, un push del router puede volver a caer aquí mismo. */}
            <a
              href={inicio}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <HomeIcon className="h-4 w-4" />
              {BOTON_INICIO}
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
