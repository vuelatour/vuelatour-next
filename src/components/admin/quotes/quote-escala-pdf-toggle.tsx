"use client";

import { useTransition } from "react";
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { setEscalaPdfVisibilidadAction } from "@/app/admin/quotes/actions";
import { cn } from "@/lib/utils";

/**
 * Toggle discreto de visibilidad en PDF por tramo (detalle de la cotización,
 * 1-sep): escribe DIRECTO en la escala viva (PATCH pdf-visibilidad) — sin
 * pasar por "Revisar" ni regenerar el snapshot. Presentación pura: el tramo
 * oculto se sigue cobrando igual; el PDF renumera solo.
 */
export function QuoteEscalaPdfToggle({
  quoteId,
  escalaId,
  oculto,
}: {
  quoteId: string;
  escalaId: string;
  oculto: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const res = await setEscalaPdfVisibilidadAction(
        quoteId,
        escalaId,
        !oculto,
      );
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo cambiar la visibilidad en el PDF");
        return;
      }
      toast.success(
        oculto
          ? "El tramo vuelve a salir en el PDF del cliente"
          : "Tramo oculto: ya no sale en el PDF del cliente (se sigue cobrando)",
      );
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={oculto}
      title={
        oculto
          ? "Oculto en el PDF del cliente (no sale en título, itinerario ni mapa; se sigue cobrando). Clic para volver a mostrarlo."
          : "Visible en el PDF del cliente. Clic para ocultarlo (no saldrá en título, itinerario ni mapa; se sigue cobrando)."
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10px] transition-colors disabled:opacity-50",
        oculto
          ? "text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
      ) : oculto ? (
        <EyeSlashIcon className="h-3.5 w-3.5" />
      ) : (
        <EyeIcon className="h-3.5 w-3.5" />
      )}
      {oculto ? "Oculto en el PDF" : "Visible en PDF"}
    </button>
  );
}
