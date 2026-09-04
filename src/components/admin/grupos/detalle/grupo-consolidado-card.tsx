"use client";

import { useState } from "react";
import { CheckCircleIcon, ChevronDownIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CLAVE_CONSOLIDADO_LABEL } from "@/lib/admin/grupos-ui";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Consolidado, LineaConsolidada } from "@/types/grupos";

/**
 * Desglose CONSOLIDADO del grupo: Σ por clave de los desgloses canónicos
 * persistidos de los hijos vivos (lo arma el API; aquí SOLO se pinta). Cada
 * línea despliega su parte por avión; abajo los totales del grupo, el
 * precio por persona y la verificación "suman exacto".
 */
export function GrupoConsolidadoCard({
  consolidado,
  pasajerosTotal,
  tcUsdMxn,
}: {
  consolidado: Consolidado;
  pasajerosTotal: number;
  tcUsdMxn: number | null;
}) {
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) =>
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const lineas = consolidado.desglose ?? [];
  const cuadra = consolidado.verificacion?.cuadra !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TableCellsIcon className="h-4 w-4 text-muted-foreground" />
          Desglose consolidado
        </CardTitle>
        <CardDescription className="text-xs">
          Suma de los desgloses de los {consolidado.aviones}{" "}
          {consolidado.aviones === 1 ? "avión vivo" : "aviones vivos"}. Cada línea
          se puede abrir para ver la parte de cada avión.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lineas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin líneas: el grupo no tiene aviones vivos con precio.</p>
        ) : (
          <div className="space-y-1">
            {lineas.map((l, i) => (
              <LineaRow
                key={`${l.clave}-${l.grupo_extra_id ?? l.iata ?? l.concepto}-${i}`}
                linea={l}
                abierta={abiertas.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Fila label="Servicio aéreo" value={fmtUsd(consolidado.subtotal_aereo_usd)} hint={`${fmtDecimal(consolidado.horas_total_hr, 2)} hr cobrables en total`} />
          <Fila label="TUAS" value={fmtUsd(consolidado.tuas_usd)} />
          <Fila label="Cargos del grupo" value={fmtUsd(consolidado.extras_usd)} />
          {consolidado.pernocta_usd !== 0 && (
            <Fila label="Viáticos por pernocta" value={fmtUsd(consolidado.pernocta_usd)} />
          )}
          {consolidado.comision_vendedor_usd !== 0 && (
            <Fila label="Comisión del vendedor" value={fmtUsd(consolidado.comision_vendedor_usd)} hint="interna, nunca en el PDF" />
          )}
          {consolidado.ajuste_usd !== 0 && (
            <Fila
              label={consolidado.ajuste_usd < 0 ? "Descuento" : "Redondeo"}
              value={fmtUsd(consolidado.ajuste_usd)}
            />
          )}
          <Fila label="IVA" value={fmtUsd(consolidado.iva_usd)} />
        </div>

        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total del grupo</p>
            <p className="text-2xl font-bold tracking-tight font-mono">{fmtUsd(consolidado.total_usd)}</p>
            {consolidado.total_mxn != null && (
              <p className="text-xs text-muted-foreground">
                {fmtMxn(consolidado.total_mxn)}
                {tcUsdMxn ? ` · tc ${fmtDecimal(tcUsdMxn, 4)}` : ""}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Por persona</p>
            <p className="text-lg font-semibold font-mono">
              {consolidado.por_persona_usd != null ? fmtUsd(consolidado.por_persona_usd) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pasajerosTotal} pasajeros · {consolidado.aviones}{" "}
              {consolidado.aviones === 1 ? "avión" : "aviones"}
            </p>
          </div>
        </div>

        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px]",
            cuadra ? "text-emerald-600 dark:text-emerald-400" : "text-destructive font-medium",
          )}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {cuadra
            ? `Las líneas suman exacto el total (${fmtUsd(consolidado.verificacion.suma_lineas_usd)}).`
            : `Las líneas suman ${fmtUsd(consolidado.verificacion.suma_lineas_usd)} y el total es ${fmtUsd(consolidado.verificacion.total_usd)}: avisa a soporte antes de cobrar.`}
        </p>
      </CardContent>
    </Card>
  );
}

function LineaRow({
  linea,
  abierta,
  onToggle,
}: {
  linea: LineaConsolidada;
  abierta: boolean;
  onToggle: () => void;
}) {
  const partes = linea.por_avion ?? [];
  const desplegable = partes.length > 0;
  return (
    <div className="rounded-md">
      <button
        type="button"
        onClick={desplegable ? onToggle : undefined}
        aria-expanded={desplegable ? abierta : undefined}
        className={cn(
          "flex w-full items-start justify-between gap-3 rounded-md px-1.5 py-1 text-left text-sm",
          desplegable && "hover:bg-muted/40 transition-colors",
        )}
      >
        <span className="text-muted-foreground min-w-0 break-words">
          <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {CLAVE_CONSOLIDADO_LABEL[linea.clave] ?? linea.clave}
          </span>
          {linea.concepto}
          {linea.aplica_iva === false && linea.clave === "EXTRA" && (
            <span className="ml-1 text-[10px]">(sin IVA)</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono">
          {fmtUsd(linea.monto_usd)}
          {desplegable && (
            <ChevronDownIcon
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                abierta && "rotate-180",
              )}
            />
          )}
        </span>
      </button>
      {desplegable && abierta && (
        <ul className="ml-4 mb-1 space-y-0.5 border-l border-border pl-3 text-xs">
          {partes.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {p.posicion != null ? `Avión ${p.posicion}` : "Avión"}
                {p.matricula ? ` · ${p.matricula}` : ""}
              </span>
              <span className="font-mono">{fmtUsd(p.monto_usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[10px]">· {hint}</span>}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
