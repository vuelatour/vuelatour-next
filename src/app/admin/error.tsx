"use client";

import { PantallaError } from "@/components/admin/pantalla-error";

/**
 * Error boundary del panel. Desde el 21-sep-2026 todo el texto está en es-MX
 * y pensado para un operador: el mensaje en inglés de Next («An error occurred
 * in the Server Components render…») ya NO se pinta — solo el código (digest),
 * la hora de Cancún y la ruta, que es lo que sistemas necesita.
 *
 * La causa más común de caer aquí era el API en plena ventana de deploy
 * (502/503 de Railway); `lib/api/reintento.ts` la absorbe antes de llegar
 * a esta pantalla.
 *
 * «Reintentar» usa `unstable_retry` (vuelve a PEDIR los datos y re-renderiza),
 * no `reset` (que solo limpia el estado y, según la documentación de esta
 * versión de Next, «no se recupera de errores de Server Components» — es
 * decir: con `reset` el botón repintaba el mismo error).
 */
export default function AdminErrorBoundary({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <PantallaError error={error} reintentar={unstable_retry ?? reset} inicio="/admin" />
  );
}
