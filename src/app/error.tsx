"use client";

import { PantallaError } from "@/components/admin/pantalla-error";

/**
 * Error boundary de la RAÍZ (todo lo que no cuelga de `/admin`: login, sitio
 * público, callbacks). Misma pantalla en es-MX que el panel — antes aquí no
 * había boundary y el operador veía la página de error cruda de Next, en
 * inglés. «Volver al inicio» va a la portada, no a `/admin`.
 *
 * «Reintentar» = `unstable_retry` (vuelve a pedir los datos); `reset` solo
 * queda de respaldo por si el runtime no lo pasa.
 */
export default function RootErrorBoundary({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return <PantallaError error={error} reintentar={unstable_retry ?? reset} inicio="/" />;
}
