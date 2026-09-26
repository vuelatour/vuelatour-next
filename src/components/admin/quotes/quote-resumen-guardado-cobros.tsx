"use client";

import { cn } from "@/lib/utils";
import { resumenGuardadoConCobros, textoCobrosSinTc } from "@/lib/admin/cotizacion-cobrada";

/**
 * Bloque del diálogo «Guardar vN» cuando la cotización se edita CON cobros
 * (permiso especial, 26-sep-2026): «Total $754 → $600 USD», «Cobrado $600 USD
 * (no cambia)» y el saldo que queda — o el SOBRECOBRO, en rojo, que el API
 * también avisa al guardar. Sin dinero propio: la resta vive en
 * `resumenGuardadoConCobros` (probada) con la tolerancia de `pendienteCobro`.
 */
export function ResumenGuardadoConCobros({
  totalAntesUsd,
  totalNuevoUsd,
  cobradoUsd,
  cobrosSinTc,
}: {
  totalAntesUsd: number;
  totalNuevoUsd: number;
  cobradoUsd: number;
  cobrosSinTc?: number | null;
}) {
  const r = resumenGuardadoConCobros({ totalAntesUsd, totalNuevoUsd, cobradoUsd });
  const sinTc = textoCobrosSinTc(cobrosSinTc);
  return (
    <div
      data-testid="resumen-guardado-con-cobros"
      className="space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
    >
      <p className="font-medium text-amber-700 dark:text-amber-400">
        Con cobros registrados · permiso especial
      </p>
      <p className="font-mono text-foreground">{r.total}</p>
      <p className="font-mono text-muted-foreground">{r.cobrado}</p>
      <p
        className={cn(
          "font-mono font-semibold",
          r.saldo.tipo === "sobrecobro"
            ? "text-destructive"
            : r.saldo.tipo === "liquidada"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
        )}
      >
        {r.saldoTexto}
      </p>
      {r.saldo.tipo === "sobrecobro" && (
        <p className="text-muted-foreground">
          Lo cobrado rebasa el total nuevo y el vuelo quedará con sobrecobro.
          Los cobros no se modifican: si hay que devolver la diferencia,
          regístrala como reembolso en «Cobros del vuelo».
        </p>
      )}
      {sinTc && <p className="text-muted-foreground">{sinTc}</p>}
    </div>
  );
}
