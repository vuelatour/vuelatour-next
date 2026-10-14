"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Indicador de carga DENTRO de un `<Link>` (14-oct-2026, pestañas y chips de
 * Gastos). Al navegar por search params la pantalla vieja se queda hasta que
 * llega la nueva (el `loading.tsx` no aparece), así que sin esto el clic en
 * «Pendientes» parecía no hacer nada. `useLinkStatus` (Next 16, documentado en
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * use-link-status.md`) solo funciona como DESCENDIENTE de un `<Link>` y se ve
 * con `prefetch={false}`. Siempre montado y de tamaño fijo (12 px): en reposo
 * es transparente, así no empuja nada al aparecer. `aria-hidden`: el cambio
 * de vista lo anuncia la página, no este adorno. `className` lo coloca (las
 * pestañas de Gastos lo montan en la esquina, `absolute`, para que el hueco
 * de 12 px no descentre la etiqueta).
 */
export function IndicadorEnlace({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-indicador-enlace
      className={cn(
        "inline-block h-3 w-3 shrink-0 rounded-full border-2 border-current border-t-transparent transition-opacity",
        pending ? "animate-spin opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
