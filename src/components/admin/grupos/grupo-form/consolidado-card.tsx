"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { CLAVE_CONSOLIDADO_LABEL } from "@/lib/admin/grupos-ui";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Consolidado, LineaConsolidada } from "@/types/grupos";

function FilaConsolidada({ linea }: { linea: LineaConsolidada }) {
  const [abierta, setAbierta] = useState(false);
  const partes = linea.por_avion.filter((p) => p.monto_usd !== 0);
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0 break-words text-muted-foreground">
          <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {CLAVE_CONSOLIDADO_LABEL[linea.clave] ?? linea.clave}
          </span>
          {linea.concepto}
          {partes.length > 0 && (
            <ChevronDownIcon
              className={cn(
                "ml-1 inline h-3 w-3 text-muted-foreground transition-transform",
                abierta && "rotate-180",
              )}
            />
          )}
        </span>
        <span className="font-mono shrink-0">{fmtUsd(linea.monto_usd)}</span>
      </button>
      {abierta && partes.length > 0 && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
          {partes.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Avión {p.posicion ?? "?"}
                {p.matricula ? ` · ${p.matricula}` : ""}
              </span>
              <span className="font-mono">{fmtUsd(p.monto_usd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Total({ label, value, hint, bold }: { label: string; value: string; hint?: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn(bold ? "font-semibold" : "text-muted-foreground")}>
        {label}
        {hint ? <span className="text-xs text-muted-foreground"> · {hint}</span> : null}
      </span>
      <span className={cn("font-mono tabular-nums", bold && "font-bold")}>{value}</span>
    </div>
  );
}

/**
 * Consolidado del grupo tal como lo manda el armador: líneas Σ por clave
 * (con "por avión" desplegable), totales, precio por persona y horas. Cero
 * cálculos aquí — hasta la verificación "suman exacto" viene del API.
 */
export function ConsolidadoCard({
  consolidado,
  pasajerosTotal,
  stale,
}: {
  consolidado: Consolidado;
  pasajerosTotal: number;
  stale: boolean;
}) {
  const c = consolidado;
  return (
    <div className={cn("space-y-3 transition-opacity", stale && "opacity-60")}>
      <div className="space-y-1.5">
        {c.desglose.map((l, i) => (
          <FilaConsolidada key={`${l.clave}-${l.grupo_extra_id ?? l.iata ?? i}`} linea={l} />
        ))}
      </div>
      <div className="space-y-1 border-t border-border pt-2">
        <Total label="Servicio aéreo" hint={`${c.aviones} ${c.aviones === 1 ? "avión" : "aviones"} · ${fmtDecimal(c.horas_total_hr)} hr`} value={fmtUsd(c.subtotal_aereo_usd)} />
        {c.tuas_usd !== 0 && <Total label="TUAS" value={fmtUsd(c.tuas_usd)} />}
        {c.extras_usd !== 0 && <Total label="Cargos del grupo" value={fmtUsd(c.extras_usd)} />}
        {c.pernocta_usd !== 0 && <Total label="Pernocta" hint="viáticos, sin IVA" value={fmtUsd(c.pernocta_usd)} />}
        {c.comision_vendedor_usd !== 0 && (
          <Total label="Comisión del vendedor" value={fmtUsd(c.comision_vendedor_usd)} />
        )}
        {c.ajuste_usd !== 0 && (
          <Total label={c.ajuste_usd < 0 ? "Descuento" : "Ajuste"} value={fmtUsd(c.ajuste_usd)} />
        )}
        <Total label="IVA" value={fmtUsd(c.iva_usd)} />
        <div className="border-t border-border pt-1.5">
          <Total label="Total del grupo" bold value={fmtUsd(c.total_usd)} />
          {c.total_mxn != null && (
            <div className="flex justify-end">
              <span className="font-mono text-xs text-muted-foreground">{fmtMxn(c.total_mxn)}</span>
            </div>
          )}
        </div>
        {c.por_persona_usd != null && (
          <Total
            label="Por persona"
            hint={`${pasajerosTotal} pax`}
            value={fmtUsd(c.por_persona_usd)}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          Verificación: las líneas suman {fmtUsd(c.verificacion.suma_lineas_usd)}
        </span>
        <Badge
          variant="outline"
          className={
            c.verificacion.cuadra
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/50 bg-destructive/10 text-destructive"
          }
        >
          {c.verificacion.cuadra ? "Suman exacto" : "No cuadra"}
        </Badge>
      </div>
    </div>
  );
}
