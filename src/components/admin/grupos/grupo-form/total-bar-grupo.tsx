"use client";

import { BookmarkSquareIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VtSpinner } from "@/components/ui/vt-loader";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ArmadoGrupo } from "@/types/grupos";

/**
 * Barra FIJA inferior del wizard: total del grupo (con IVA), MXN, precio
 * por persona, Σ pax vs total (siempre visible), aviones y horas — todo
 * leído del armado del server — más el botón de guardar y, en el alta, el
 * interruptor "Apartar (reserva)".
 */
export function TotalBarGrupo({
  armado,
  armando,
  stale,
  error,
  falta,
  pasajerosTotal,
  paxCapturados,
  titulo,
  subtitulo,
  saveLabel,
  saveDisabled,
  saving,
  onSave,
  apartar,
  onApartarChange,
}: {
  armado: ArmadoGrupo | null;
  armando: boolean;
  stale: boolean;
  error: string | null;
  /** Qué falta capturar para poder calcular (null = completo). */
  falta: string | null;
  pasajerosTotal: number;
  paxCapturados: number;
  titulo?: string | null;
  subtitulo?: string | null;
  saveLabel: string;
  saveDisabled: boolean;
  saving: boolean;
  onSave: () => void;
  /** Solo alta: undefined oculta el interruptor. */
  apartar?: boolean;
  onApartarChange?: (v: boolean) => void;
}) {
  const c = armado?.consolidado ?? null;
  const paxOk = pasajerosTotal > 0 && paxCapturados === pasajerosTotal;
  const celdas: { label: string; value: string; alerta?: boolean }[] = [];
  celdas.push({
    label: "Pasajeros",
    value: `${paxCapturados} de ${pasajerosTotal || "—"}`,
    alerta: pasajerosTotal > 0 && !paxOk,
  });
  if (c) {
    celdas.push({ label: "Aviones", value: String(c.aviones) });
    celdas.push({ label: "Horas", value: `${fmtDecimal(c.horas_total_hr)} hr` });
    celdas.push({ label: "Servicio aéreo", value: fmtUsd(c.subtotal_aereo_usd) });
    if (c.tuas_usd) celdas.push({ label: "TUAS", value: fmtUsd(c.tuas_usd) });
    if (c.extras_usd) celdas.push({ label: "Cargos", value: fmtUsd(c.extras_usd) });
    if (c.pernocta_usd) celdas.push({ label: "Pernocta", value: fmtUsd(c.pernocta_usd) });
    if (c.ajuste_usd) {
      celdas.push({ label: c.ajuste_usd < 0 ? "Descuento" : "Ajuste", value: fmtUsd(c.ajuste_usd) });
    }
    celdas.push({ label: "IVA", value: fmtUsd(c.iva_usd) });
    if (c.por_persona_usd != null) {
      celdas.push({ label: "Por persona", value: fmtUsd(c.por_persona_usd) });
    }
  }
  const cargando = armando || (stale && !!armado);
  return (
    <div className="sticky bottom-0 z-30 -mx-1 px-1 pb-1">
      <div className="rounded-xl border border-brand-500 bg-brand-600 text-white shadow-md px-4 py-2.5">
        <div className={cn("flex flex-wrap items-baseline gap-2 transition-opacity", cargando && "opacity-70")}>
          <span className="text-[11px] uppercase tracking-wider text-white/80">
            Total del grupo con IVA
          </span>
          {error ? (
            <span className="text-sm font-semibold text-white">No se pudo calcular</span>
          ) : falta ? (
            <span className="text-sm text-white/85">{falta}</span>
          ) : !c ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-white/85">
              <VtSpinner /> Calculando…
            </span>
          ) : (
            <>
              <span className="text-2xl font-bold tracking-tight font-mono tabular-nums">
                {fmtUsd(c.total_usd)}
              </span>
              <span className="text-xs text-white/80">USD</span>
              {c.total_mxn != null && (
                <span className="text-xs text-white/80 font-mono">{fmtMxn(c.total_mxn)}</span>
              )}
              {armado && (
                <Badge variant="outline" className="text-[10px] border-white/50 text-white">
                  {armado.tarifa_tipo}
                </Badge>
              )}
              {cargando && <VtSpinner className="text-white/80" />}
            </>
          )}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
            {(titulo || subtitulo) && (
              <div className="min-w-0 text-right">
                {titulo && (
                  <p className="truncate text-sm font-semibold leading-tight max-w-[280px]">{titulo}</p>
                )}
                {subtitulo && (
                  <p className="font-mono text-[11px] leading-tight text-white/80">{subtitulo}</p>
                )}
              </div>
            )}
            {onApartarChange && (
              <label className="flex items-center gap-2 text-xs text-white/90">
                <Switch
                  checked={apartar === true}
                  onCheckedChange={onApartarChange}
                  className="data-checked:bg-white"
                />
                Apartar (reserva)
              </label>
            )}
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={saveDisabled || saving}
              className="shrink-0 gap-1.5 bg-white text-brand-700 hover:bg-white/90 disabled:opacity-60"
            >
              {saving ? <VtSpinner /> : <BookmarkSquareIcon className="h-4 w-4" />}
              {saving ? "Guardando…" : saveLabel}
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/25 pt-1.5 transition-opacity",
            cargando && "opacity-70",
          )}
        >
          {celdas.map((x) => (
            <div key={x.label}>
              <p className="text-[11px] uppercase tracking-wider leading-tight text-white/75 whitespace-nowrap">
                {x.label}
              </p>
              <p
                className={cn(
                  "font-mono tabular-nums text-xs whitespace-nowrap",
                  x.alerta && "rounded bg-white/20 px-1 font-semibold",
                )}
              >
                {x.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
