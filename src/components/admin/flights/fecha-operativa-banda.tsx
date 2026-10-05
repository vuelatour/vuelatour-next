"use client";

import { useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ReagendarTramosDialog } from "@/components/admin/quotes/reagendar-tramos-dialog";
import {
  BOTON_BANDA_MOVER,
  NOTA_BANDA_SIN_PERMISO,
  textoBandaFechaOperativa,
  type DecisionBandaFechaOperativa,
} from "@/lib/admin/quote-fecha-operativa";

/**
 * BANDA ÁMBAR del detalle del vuelo (revisión 5-oct-2026): la cotización dice
 * un día y el vuelo operativo (sus tramos) otro. Pasa cuando en el modal de la
 * cotización contestaron «No, solo la cotización»: el modal no vuelve a salir
 * y aquí se mueve en UN clic, con el MISMO diálogo y la MISMA action
 * (`ReagendarTramosDialog` con `contexto="vuelo"`). La regla de cuándo se
 * muestra es `decidirBandaFechaOperativa` (la calcula la página del server y
 * llega aquí ya decidida). Los textos salen de `quote-fecha-operativa.ts`.
 *
 * Tras mover, la página se refresca y la banda desaparece; el diálogo sigue
 * montado (cerrado) con las fechas con las que se abrió, para que su texto no
 * se vacíe durante la animación de salida.
 */
export function FechaOperativaBanda({
  decision,
  vueloId,
  puedeMover,
}: {
  decision: DecisionBandaFechaOperativa;
  vueloId: string;
  puedeMover: boolean;
}) {
  const [dialogo, setDialogo] = useState<{
    nuevaFecha: string;
    fechaOperativa: string;
  } | null>(null);
  const [abierto, setAbierto] = useState(false);

  if (!decision.mostrar && !dialogo) return null;

  return (
    <>
      {decision.mostrar && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap"
          data-fecha-operativa-banda=""
        >
          <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
            <CalendarDaysIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {textoBandaFechaOperativa(decision.fechaCotizacion, decision.fechaOperativa)}
              {!puedeMover && <> {NOTA_BANDA_SIN_PERMISO}</>}
            </span>
          </p>
          {puedeMover && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer h-auto max-w-full whitespace-normal py-1.5 text-left border-amber-500/50 text-amber-700 dark:text-amber-300"
              onClick={() => {
                setDialogo({
                  nuevaFecha: decision.fechaCotizacion,
                  fechaOperativa: decision.fechaOperativa,
                });
                setAbierto(true);
              }}
            >
              {BOTON_BANDA_MOVER}
            </Button>
          )}
        </div>
      )}
      {dialogo && (
        <ReagendarTramosDialog
          contexto="vuelo"
          abierto={abierto}
          nuevaFecha={dialogo.nuevaFecha}
          fechaOperativa={dialogo.fechaOperativa}
          vueloId={vueloId}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
