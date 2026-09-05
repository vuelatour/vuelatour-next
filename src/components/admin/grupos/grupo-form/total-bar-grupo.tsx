"use client";

import {
  BookmarkSquareIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VtSpinner } from "@/components/ui/vt-loader";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import type { EstadoCobroSemaforo } from "@/lib/admin/cobros";
import { textoIvaPct } from "@/lib/admin/grupos-ui";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Consolidado } from "@/types/grupos";
import type { TipoTarifa } from "@/types/quote";

/** Cobro del grupo (solo lectura): semáforo + cobrado/saldo del API. */
export interface CobroBarra {
  semaforo: EstadoCobroSemaforo;
  cobradoUsd: number;
  saldoUsd: number;
  /** true = falta dinero real (fuera de la tolerancia de redondeo). */
  saldoPendiente: boolean;
}

/**
 * Barra FIJA inferior del grupo: total con IVA, MXN, precio por persona,
 * Σ pax vs total (siempre visible), aviones y horas — todo leído del
 * consolidado del server (armado en edición, cabecera en lectura).
 *
 * Dos modos (5-sep-2026, página única del grupo):
 * - `lectura`: el consolidado persistido, el cobro del grupo (semáforo,
 *   cobrado y saldo) y el botón «Revisar» (o la razón por la que no se puede).
 * - `edicion`: el preview vivo del armador, «Cancelar» y «Guardar revisión»
 *   / «Crear grupo» (+ «Apartar» en el alta).
 */
export function TotalBarGrupo({
  consolidado,
  tarifaTipo,
  armando,
  stale,
  error,
  falta,
  pasajerosTotal,
  paxCapturados,
  titulo,
  subtitulo,
  modo = "edicion",
  saveLabel,
  saveDisabled,
  saving,
  onSave,
  onCancelar,
  onRevisar,
  revisarBloqueado,
  cobro,
  apartar,
  onApartarChange,
}: {
  /** Consolidado a pintar (armado vivo o `grupo.consolidado`); null = sin cálculo. */
  consolidado: Consolidado | null;
  tarifaTipo: TipoTarifa | null;
  armando: boolean;
  stale: boolean;
  error: string | null;
  /** Qué falta capturar para poder calcular (null = completo). */
  falta: string | null;
  pasajerosTotal: number;
  paxCapturados: number;
  titulo?: string | null;
  subtitulo?: string | null;
  modo?: "lectura" | "edicion";
  saveLabel: string;
  saveDisabled: boolean;
  saving: boolean;
  onSave: () => void;
  /** Edición en el lugar: descarta los cambios y vuelve a lectura. */
  onCancelar?: () => void;
  /** Lectura: entra a edición en el lugar. Ausente = sin permiso (se oculta). */
  onRevisar?: () => void;
  /** Lectura: razón por la que NO se puede revisar (botón deshabilitado). */
  revisarBloqueado?: string | null;
  /** Lectura: cobro del grupo (del API). */
  cobro?: CobroBarra | null;
  /** Solo alta: undefined oculta el interruptor. */
  apartar?: boolean;
  onApartarChange?: (v: boolean) => void;
}) {
  const c = consolidado;
  const lectura = modo === "lectura";
  const paxOk = pasajerosTotal > 0 && paxCapturados === pasajerosTotal;
  // `hint` = operación sutil al lado del número (campos del API tal cual).
  const celdas: { label: string; value: string; hint?: string; alerta?: boolean }[] = [];
  celdas.push({
    label: "Pasajeros",
    value: `${paxCapturados} de ${pasajerosTotal || "—"}`,
    alerta: pasajerosTotal > 0 && !paxOk,
  });
  if (c) {
    celdas.push({ label: "Aviones", value: String(c.aviones) });
    celdas.push({ label: "Horas", value: `${fmtDecimal(c.horas_total_hr)} hr` });
    celdas.push({ label: "Servicio aéreo", value: fmtUsd(c.subtotal_aereo_usd) });
    if (c.tuas_usd) {
      const n = c.tuas?.aeropuertos.filter((a) => a.monto_usd !== 0).length;
      celdas.push({
        label: "TUAS",
        value: fmtUsd(c.tuas_usd),
        hint: n ? `${n} ${n === 1 ? "aeropuerto" : "aeropuertos"}` : undefined,
      });
    }
    if (c.extras_usd) celdas.push({ label: "Cargos", value: fmtUsd(c.extras_usd) });
    if (c.pernocta_usd) celdas.push({ label: "Pernocta", value: fmtUsd(c.pernocta_usd) });
    if (c.ajuste_usd) {
      celdas.push({ label: c.ajuste_usd < 0 ? "Descuento" : "Ajuste", value: fmtUsd(c.ajuste_usd) });
    }
    celdas.push({ label: "IVA", value: fmtUsd(c.iva_usd), hint: textoIvaPct(c) ?? undefined });
    if (c.por_persona_usd != null) {
      celdas.push({
        label: "Por persona",
        value: fmtUsd(c.por_persona_usd),
        hint: c.por_persona ? `÷ ${c.por_persona.pasajeros_total}` : undefined,
      });
    }
  }
  const cargando = !lectura && (armando || (stale && !!c));
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
              {tarifaTipo && (
                <Badge variant="outline" className="text-[10px] border-white/50 text-white">
                  {tarifaTipo}
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
            {lectura && cobro && (
              <a
                href="#cobros-grupo"
                title="Ir a Cobros del grupo (registrar un pago del cliente)"
                className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-xs text-brand-700 transition-opacity hover:opacity-90"
              >
                <CobroEstadoBadge estado={cobro.semaforo} />
                <span className="whitespace-nowrap">
                  Cobrado <span className="font-mono font-semibold">{fmtUsd(cobro.cobradoUsd)}</span>
                  {" · "}
                  Saldo{" "}
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      cobro.saldoPendiente && "text-amber-600",
                    )}
                  >
                    {fmtUsd(cobro.saldoUsd)}
                  </span>
                </span>
              </a>
            )}
            {lectura ? (
              onRevisar && (
                <div className="flex items-center gap-2">
                  {revisarBloqueado && (
                    <span className="max-w-[240px] text-right text-[11px] leading-tight text-white/85">
                      {revisarBloqueado}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={onRevisar}
                    disabled={!!revisarBloqueado}
                    title={revisarBloqueado ?? "Editar el grupo aquí mismo (genera una versión nueva)"}
                    className="shrink-0 gap-1.5 bg-white text-brand-700 hover:bg-white/90 disabled:opacity-60"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Revisar
                  </Button>
                </div>
              )
            ) : (
              <>
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
                {onCancelar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onCancelar}
                    disabled={saving}
                    title="Descartar los cambios y volver a la cotización tal como está"
                    className="shrink-0 gap-1.5 border border-white/50 text-white hover:bg-white/15 hover:text-white"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Cancelar
                  </Button>
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
              </>
            )}
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
                {x.hint && <span className="ml-1 text-[10px] text-white/70">{x.hint}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
