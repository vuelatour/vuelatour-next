"use client";

import { useMemo, useState } from "react";
import {
  ExclamationTriangleIcon,
  LockClosedIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import { isoToCancunInput } from "@/lib/datetime";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AvionArmado, RotacionesGrupo } from "@/types/grupos";
import {
  MOTIVO_BLOQUEO_LABEL,
  avionNuevo,
  keyDeAvion,
  type AeronaveOption,
  type AvionForm,
  type PilotoOption,
} from "./types";

function Segmentado<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-navy-800/50 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={String(opt.value)}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-8 px-2 text-xs font-medium rounded-md transition-colors",
              active ? "bg-navy-700 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {opt.label}
            {opt.sub && (
              <span className={cn("ml-1 font-mono text-[10px] font-normal tabular-nums", active ? "text-foreground/70" : "text-muted-foreground")}>
                {opt.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Filas por avión del grupo (una por vuelo hijo). Lo capturable vive en el
 * formulario (avión, pax, vueltas, tripulación, salida explícita, overrides,
 * aceptar squawk); lo derivado (tarifa efectiva, tiempo, total del hijo,
 * salida escalonada, avisos, ancla, sugerido) se pinta del armado del
 * server que corresponde a esa fila (misma llave que el API).
 */
export function AvionesEditor({
  value,
  onChange,
  armadoAviones,
  stale,
  aircraft,
  pilots,
  pasajerosTotal,
  revise,
  onQuitar,
  onProponer,
  disabled = false,
}: {
  value: AvionForm[];
  onChange: (aviones: AvionForm[]) => void;
  /** Aviones del último armado (alineados por índice) o null. */
  armadoAviones: AvionArmado[] | null;
  stale: boolean;
  aircraft: AeronaveOption[];
  pilots: PilotoOption[];
  pasajerosTotal: number;
  revise: boolean;
  /** Quitar la fila i (el padre confirma si es un hijo real). */
  onQuitar: (idx: number) => void;
  /** Alta: reemplazar la lista por la propuesta del server. */
  onProponer?: () => void;
  disabled?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);
  const aeronavePorId = useMemo(() => new Map(aircraft.map((a) => [a.id, a])), [aircraft]);
  const usados = useMemo(() => new Map(value.map((a, i) => [a.aeronave_id, i + 1])), [value]);

  const opcionesAvion = (idxActual: number | null) =>
    aircraft
      .filter((a) => a.activa || (idxActual != null && value[idxActual]?.aeronave_id === a.id))
      .map((a) => {
        const en = usados.get(a.id);
        const repetido = en != null && en !== (idxActual == null ? -1 : idxActual + 1);
        const sinTarifa = !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd;
        return {
          value: a.id,
          label: `${a.matricula} — ${a.modelo}`,
          description: [
            `${a.asientos} asientos`,
            `${a.velocidad_crucero_kts} kts`,
            !a.activa ? "dada de baja" : null,
            sinTarifa ? "sin tarifa configurada" : null,
            repetido ? `ya está en el avión ${en}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          descriptionClassName: repetido ? "text-amber-600 dark:text-amber-400" : undefined,
        };
      });

  const pilotOptions = (excluir: string | null) => [
    { value: "", label: "Sin asignar", description: "Se asigna después desde el vuelo" },
    ...pilots
      .filter((p) => p.id !== excluir)
      .map((p) => ({
        value: p.id,
        label: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
      })),
  ];

  const update = (idx: number, patch: Partial<AvionForm>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const agregar = (aeronaveId: string) => {
    const a = aeronavePorId.get(aeronaveId);
    const faltan = Math.max(0, pasajerosTotal - value.reduce((s, x) => s + (Number(x.pax) || 0), 0));
    const pax = Math.max(1, Math.min(faltan || 1, a?.asientos || 1));
    onChange([...value, avionNuevo(aeronaveId, pax)]);
    setAgregando(false);
  };

  const filaArmada = (a: AvionForm, i: number): AvionArmado | null => {
    const arm = armadoAviones?.[i];
    if (!arm) return null;
    return arm.key === keyDeAvion(a, i) && arm.aeronave.id === a.aeronave_id ? arm : null;
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {revise
            ? "Sin aviones: el sistema propone una flota nueva (los vuelos que quitaste se cancelan al guardar). También puedes agregarlos a mano."
            : "Completa cliente, fecha, pasajeros y ruta: el sistema propone qué aviones usar y cuántos pasajeros van en cada uno. También puedes agregarlos a mano."}
        </div>
      )}
      {value.map((a, i) => {
        const arm = filaArmada(a, i);
        const ficha = aeronavePorId.get(a.aeronave_id);
        const congelado = a.congelado != null;
        const bloqueado = disabled || congelado;
        const asientos = ficha?.asientos ?? arm?.aeronave.asientos ?? null;
        const capacidadFila = asientos != null ? asientos * a.rotaciones : null;
        const excede = capacidadFila != null && a.pax > capacidadFila;
        const salidaEfectiva = a.fecha_salida_plan || (arm ? isoToCancunInput(arm.fecha_salida_plan) : "");
        const calculo = arm?.calculo ?? null;
        return (
          <div
            key={a.uid}
            className={cn(
              "rounded-lg border bg-card p-3 space-y-3 transition-opacity",
              arm?.es_ancla ? "border-brand-600/50" : "border-border",
              stale && arm && "opacity-80",
              congelado && "bg-navy-800/40",
            )}
          >
            {/* Encabezado: posición · avión · badges · total del hijo */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Avión {i + 1}</span>
                  {a.folio != null && (
                    <span className="font-mono text-xs text-muted-foreground">#{a.folio}</span>
                  )}
                  {arm?.es_ancla && (
                    <Badge variant="outline" className="border-brand-600/40 text-[10px] text-brand-600 dark:text-brand-400" title="Avión ancla: recibe los centavos del reparto y los cargos 'todo a un avión'">
                      Ancla
                    </Badge>
                  )}
                  {congelado && (
                    <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400">
                      <LockClosedIcon className="h-3 w-3" />
                      Congelado · {MOTIVO_BLOQUEO_LABEL[a.congelado!]}
                    </Badge>
                  )}
                </div>
                {ficha && (
                  <p className="text-xs text-muted-foreground">
                    {ficha.matricula} — {ficha.modelo} · {ficha.asientos} asientos · {ficha.velocidad_crucero_kts} kts
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total del avión</p>
                <p className="font-mono text-base font-bold tabular-nums">
                  {calculo ? fmtUsd(calculo.totales.total_usd) : a.total_actual_usd != null ? fmtUsd(a.total_actual_usd) : "—"}
                </p>
                {calculo && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmtDecimal(calculo.tiempos.cobrable_hr)} hr × {fmtUsd(arm!.aeronave.tarifa_hora_usd)}/hr
                    {calculo.totales.tuas_total_usd ? ` · TUAS ${fmtUsd(calculo.totales.tuas_total_usd)}` : ""}
                    {calculo.totales.extras_total_usd ? ` · cargos ${fmtUsd(calculo.totales.extras_total_usd)}` : ""}
                  </p>
                )}
              </div>
            </div>

            {congelado && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Este avión ya no se puede recotizar ({MOTIVO_BLOQUEO_LABEL[a.congelado!]}): su
                precio, cargos y tripulación se conservan tal cual. Guarda con «Aplicar solo a
                los editables» prendido.
              </p>
            )}

            {/* Captura */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_0.6fr_1fr]">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Aeronave</Label>
                <SearchableSelect
                  options={opcionesAvion(i)}
                  value={a.aeronave_id}
                  onChange={(v) => update(i, { aeronave_id: v, aceptar_discrepancia_alta: false })}
                  placeholder="Selecciona aeronave"
                  disabled={bloqueado}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Pasajeros</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  disabled={bloqueado}
                  value={a.pax}
                  onChange={(e) => update(i, { pax: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                  className={cn(excede && "border-destructive")}
                />
                <p className={cn("text-[11px]", excede ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {capacidadFila != null
                    ? excede
                      ? `No caben: máx. ${capacidadFila}`
                      : `máx. ${capacidadFila}${a.rotaciones === 2 ? " en 2 vueltas" : ""}`
                    : "—"}
                  {arm && a.rotaciones === 2 && arm.pax_por_rotacion.length === 2
                    ? ` · ${arm.pax_por_rotacion.join(" + ")}`
                    : ""}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Vueltas</Label>
                <Segmentado<RotacionesGrupo>
                  value={a.rotaciones}
                  disabled={bloqueado}
                  onChange={(v) => update(i, { rotaciones: v })}
                  options={[
                    { value: 1, label: "1 vuelta" },
                    { value: 2, label: "Doble vuelta" },
                  ]}
                />
                <p className="text-[11px] text-muted-foreground">
                  Doble vuelta: regresa vacío por más pasajeros (solo ida y vuelta).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Piloto</Label>
                <SearchableSelect
                  options={pilotOptions(a.copiloto_id)}
                  value={a.piloto_id ?? ""}
                  onChange={(v) => update(i, { piloto_id: v || null })}
                  placeholder="Sin asignar"
                  disabled={bloqueado}
                />
                {!a.piloto_id && arm?.piloto_sugerido && !bloqueado && (
                  <button
                    type="button"
                    onClick={() => update(i, { piloto_id: arm.piloto_sugerido!.id })}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 underline underline-offset-2"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Usar sugerido: {arm.piloto_sugerido.nombre}
                  </button>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Copiloto (opcional)</Label>
                <SearchableSelect
                  options={pilotOptions(a.piloto_id)}
                  value={a.copiloto_id ?? ""}
                  onChange={(v) => update(i, { copiloto_id: v || null })}
                  placeholder="Sin copiloto"
                  disabled={bloqueado}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.5fr_1fr]">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                  Salida de este avión
                </Label>
                {bloqueado ? (
                  <p className="text-sm">{salidaEfectiva ? salidaEfectiva.replace("T", " ") : "—"}</p>
                ) : (
                  <FechaHoraCampo
                    value={salidaEfectiva}
                    onChange={(v) => update(i, { fecha_salida_plan: v })}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  {a.fecha_salida_plan ? (
                    <>
                      Hora fija para este avión.{" "}
                      {!bloqueado && (
                        <button
                          type="button"
                          onClick={() => update(i, { fecha_salida_plan: "" })}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Volver a escalonar automático
                        </button>
                      )}
                    </>
                  ) : (
                    "Escalonada automáticamente (10 min entre aviones; doble vuelta primero)."
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-foreground/70">Tarifa y tiempo</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      disabled={bloqueado}
                      placeholder={arm ? `${arm.aeronave.tarifa_hora_usd}` : a.tarifa_actual_usd != null ? `${a.tarifa_actual_usd}` : "USD/hr"}
                      value={a.tarifa_hora_override_usd ?? ""}
                      onChange={(e) =>
                        update(i, {
                          tarifa_hora_override_usd: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        })
                      }
                      title="Tarifa USD/hr pactada SOLO para este avión (vacío = la del cliente o del avión)"
                    />
                    <p className="text-[10px] text-muted-foreground">USD/hr</p>
                  </div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={48}
                      disabled={bloqueado}
                      placeholder={calculo ? fmtDecimal(calculo.tiempos.cobrable_hr, 1) : "hr"}
                      value={a.tiempo_cobrable_override_hr ?? ""}
                      onChange={(e) =>
                        update(i, {
                          tiempo_cobrable_override_hr: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        })
                      }
                      title="Horas cobrables pactadas SOLO para este avión (vacío = las calcula el motor)"
                    />
                    <p className="text-[10px] text-muted-foreground">hr cobrables</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {arm
                    ? `${fmtUsd(arm.aeronave.tarifa_hora_usd)}/hr${
                        calculo?.tarifa.proviene_de_override
                          ? " · pactada para este avión"
                          : calculo?.tarifa.preferencial_cliente
                            ? " · preferencial del cliente"
                            : ""
                      }`
                    : "Vacíos = tarifa del cliente/avión y horas del motor."}
                </p>
              </div>
            </div>

            {/* Avisos del armador para esta fila (nunca se esconden) */}
            {arm && arm.avisos.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {arm.avisos.map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
            {arm?.requiere_aceptar_discrepancia_alta && !congelado && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <div className="space-y-0.5 text-amber-700 dark:text-amber-400">
                  <p className="font-medium">Discrepancia ALTA sin resolver en {arm.aeronave.matricula}</p>
                  {arm.discrepancias_alta.map((d) => (
                    <p key={d.id}>• {d.descripcion}</p>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <Switch
                    disabled={disabled}
                    checked={a.aceptar_discrepancia_alta}
                    onCheckedChange={(c) => update(i, { aceptar_discrepancia_alta: c })}
                  />
                  Usar de todos modos (se avisa al mecánico)
                </label>
              </div>
            )}

            {!disabled && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onQuitar(i)}
                  disabled={a.congelado === "COMPLETADO"}
                  className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity disabled:opacity-40"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  {a.vuelo_id ? "Quitar del grupo" : "Quitar"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!disabled && (
        <div className="space-y-2">
          {agregando ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchableSelect
                  options={opcionesAvion(null)}
                  value=""
                  onChange={agregar}
                  placeholder="Elige el avión a agregar…"
                  emptyText="Sin aviones activos"
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAgregando(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAgregando(true)} className="gap-1.5">
                <PlusIcon className="h-3.5 w-3.5" />
                Agregar avión
              </Button>
              {onProponer && (
                <Button type="button" variant="ghost" size="sm" onClick={onProponer} className="gap-1.5" title="El sistema propone qué aviones usar y cuántos pasajeros van en cada uno">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Proponer flota
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
