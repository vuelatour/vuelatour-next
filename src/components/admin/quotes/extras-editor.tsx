"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisHorizontalIcon,
  LockClosedIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import {
  cantidadEfectiva,
  esExtraDeGrupo,
  extraUsaUnitario,
  montoReferencia,
  textoCantidadUnitario,
} from "@/lib/admin/extras";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExtraConcepto } from "@/types/quote";

export const EXTRAS_SUGERIDOS = ["Handler", "Comisariato", "Extensión de servicios"];

/**
 * Editor de conceptos extra (FUENTE ÚNICA, 4-sep-2026): agrega, edita y
 * quita líneas en la misma pantalla. Desde F3 (8-sep-2026) su único
 * consumidor es el desglose del cotizador (la card «Ajuste rápido» se
 * retiró: pasajeros y extras se editan en el documento).
 *
 * Dos modos por renglón:
 * - Monto: concepto + monto NATIVO + moneda (como siempre).
 * - Cantidad × precio: cantidad (o "por persona" = pasajeros del vuelo) ×
 *   precio unitario nativo. El monto se pinta DERIVADO y deshabilitado como
 *   referencia: quien lo calcula y persiste es el motor (round2).
 *
 * Renglones con origen GRUPO (materializados desde la cotización de grupo)
 * se pintan bloqueados: no se editan ni se quitan aquí — "Se edita desde el
 * grupo G-12". El API los ancla igual al revisar/ajustar el hijo.
 */
export function ExtrasEditor({
  value,
  onChange,
  tcCapturado,
  onFocusTc,
  sinTcTexto,
  pasajeros,
  grupo,
  readOnly = false,
  variant = "card",
}: {
  value: ExtraConcepto[];
  onChange: (extras: ExtraConcepto[]) => void;
  /**
   * `fila` (F2, 8-sep-2026): renglones EN LÍNEA con las etiquetas del PDF
   * — `[concepto] [cant] × [unitario] [moneda] = monto` — para el desglose
   * del documento; «⋯» abre IVA propio / por persona / modo del renglón.
   * `card` (default) es la tarjeta de siempre; hoy sin consumidor (el
   * ajuste rápido se retiró en F3), se conserva para editores fuera del
   * documento.
   */
  variant?: "card" | "fila";
  /** Hay TC (MXN por USD) capturado: sin él los renglones MXN no entran al total. */
  tcCapturado: boolean;
  /** Abre la sección de Cobro antes del scroll+focus al campo de TC
   *  (cotizador). Sin él, el aviso MXN-sin-TC es solo texto. */
  onFocusTc?: () => void;
  /** Texto del aviso MXN sin TC cuando no hay `onFocusTc`. */
  sinTcTexto?: string;
  /** Pasajeros del vuelo: cantidad efectiva de los renglones "por persona". */
  pasajeros?: number | null;
  /** Liga del hijo con su grupo (para la nota de los renglones bloqueados). */
  grupo?: { id: string; folio: number | string | null } | null;
  /**
   * Solo LECTURA (página única de la cotización, 5-sep-2026): cada renglón
   * se pinta como texto legible (concepto · cantidad × precio · monto) sin
   * inputs ni botones de agregar/quitar. Mismo componente = misma fuente.
   */
  readOnly?: boolean;
}) {
  const update = (idx: number, patch: Partial<ExtraConcepto>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const add = (concepto = "") =>
    onChange([...value, { concepto, monto_usd: 0, moneda: "USD", aplica_iva: true }]);
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  /** Cambia el modo del renglón (monto ⇄ cantidad × precio) sin perder concepto/moneda/IVA. */
  const setModo = (idx: number, unitario: boolean) => {
    const e = value[idx];
    const next = [...value];
    if (unitario) {
      next[idx] = {
        ...e,
        monto_usd: 0,
        // Arranca con lo que ya se había tecleado como monto (si había) como
        // precio unitario y cantidad 1: menos tecleo para "Camionetas 2 × $250".
        unitario: Number(e.monto_usd) > 0 ? Number(e.monto_usd) : 0,
        cantidad: 1,
        por_persona: false,
      };
    } else {
      const { unitario: _u, cantidad: _c, por_persona: _p, ...resto } = e;
      void _u;
      void _c;
      void _p;
      next[idx] = { ...resto, monto_usd: 0 };
    }
    onChange(next);
  };

  // Renglones con el «⋯» abierto (solo `fila`): estado de UI, no de datos.
  const [detallesAbiertos, setDetallesAbiertos] = useState<Set<number>>(
    () => new Set(),
  );
  const toggleDetalles = (idx: number) =>
    setDetallesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const notaGrupo = grupo ? (
    <Link
      href={`/admin/quotes/grupo/${grupo.id}`}
      className="underline underline-offset-2 hover:text-foreground"
    >
      Se edita desde el grupo {folioTexto(grupo.folio)}
    </Link>
  ) : (
    <span>Se edita desde la cotización de grupo</span>
  );

  if (readOnly) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Conceptos extra</Label>
        {value.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin conceptos extra.</p>
        ) : (
          <div className="space-y-1.5">
            {value.map((e, idx) => {
              const usaUnitario = extraUsaUnitario(e);
              const esMxn = e.moneda === "MXN";
              const referencia = montoReferencia(e, pasajeros);
              const fmt = esMxn ? fmtMxn : fmtUsd;
              const deGrupo = esExtraDeGrupo(e);
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2 text-sm",
                    deGrupo
                      ? "border-fuchsia-500/30 bg-fuchsia-500/5"
                      : "border-border bg-navy-800/50",
                  )}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {deGrupo && (
                        <LockClosedIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
                      )}
                      <span className="font-medium break-words">
                        {e.concepto || "(sin concepto)"}
                      </span>
                      {e.aplica_iva === false && (
                        <span className="text-[10px] text-muted-foreground">(sin IVA)</span>
                      )}
                      {e.por_persona && (
                        <span className="text-[10px] text-muted-foreground">
                          · por persona
                          {pasajeros != null && pasajeros > 0 ? ` (${pasajeros} pax)` : ""}
                        </span>
                      )}
                    </span>
                    {deGrupo && (
                      <span className="block text-[11px] text-fuchsia-700/90 dark:text-fuchsia-300/90">
                        {notaGrupo}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs shrink-0 text-right">
                    {usaUnitario ? (
                      <>
                        {textoCantidadUnitario(e, pasajeros)}
                        {referencia != null && (
                          <span className="ml-1 text-muted-foreground">= {fmt(referencia)}</span>
                        )}
                      </>
                    ) : (
                      fmt(Number(e.monto_usd) || 0)
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (variant === "fila") {
    return (
      <div className="space-y-1.5">
        {value.map((e, idx) => {
          const bloqueado = esExtraDeGrupo(e);
          const usaUnitario = extraUsaUnitario(e);
          const esMxn = e.moneda === "MXN";
          const referencia = montoReferencia(e, pasajeros);
          const fmt = esMxn ? fmtMxn : fmtUsd;
          const mxnSinTc =
            esMxn &&
            (usaUnitario ? Number(e.unitario) > 0 : Number(e.monto_usd) > 0) &&
            !tcCapturado;

          if (bloqueado) {
            return (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 px-2 py-1.5 text-sm"
                title="Concepto del grupo: se materializó desde la cotización de grupo y solo se cambia allá."
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <LockClosedIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
                  <span className="font-medium">{e.concepto}</span>
                  {e.aplica_iva === false && (
                    <span className="text-[10px] text-muted-foreground">(sin IVA)</span>
                  )}
                  <span className="text-[11px] text-fuchsia-700/90 dark:text-fuchsia-300/90">
                    {notaGrupo}
                  </span>
                </span>
                <span className="font-mono text-xs shrink-0">
                  {usaUnitario ? (
                    <>
                      {textoCantidadUnitario(e, pasajeros)}
                      {referencia != null && (
                        <span className="ml-1 text-muted-foreground">= {fmt(referencia)}</span>
                      )}
                    </>
                  ) : (
                    fmt(Number(e.monto_usd) || 0)
                  )}
                </span>
              </div>
            );
          }

          const detalles = detallesAbiertos.has(idx);
          return (
            <div
              key={idx}
              className="rounded-md border border-border bg-navy-800/40 px-2 py-1.5 space-y-1.5"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  placeholder="Concepto (ej. Handler)"
                  value={e.concepto}
                  onChange={(ev) => update(idx, { concepto: ev.target.value })}
                  aria-label="Concepto del extra"
                  className="h-8 min-w-[9rem] flex-1"
                />
                {usaUnitario ? (
                  <>
                    <Input
                      type="number"
                      step="1"
                      min={0}
                      disabled={e.por_persona === true}
                      title={
                        e.por_persona
                          ? "Por persona: la cantidad son los pasajeros del vuelo"
                          : "Cantidad"
                      }
                      aria-label="Cantidad"
                      value={
                        e.por_persona
                          ? (cantidadEfectiva(e, pasajeros) ?? "")
                          : (e.cantidad ?? "")
                      }
                      onChange={(ev) =>
                        update(idx, { cantidad: Math.max(0, Number(ev.target.value) || 0) })
                      }
                      className="h-8 w-16 text-right font-mono"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder={esMxn ? "MXN" : "USD"}
                      aria-label="Precio unitario"
                      value={e.unitario || ""}
                      onChange={(ev) =>
                        update(idx, { unitario: Number(ev.target.value) || 0 })
                      }
                      className="h-8 w-24 text-right font-mono"
                    />
                    <MonedaSelect
                      value={esMxn ? "MXN" : "USD"}
                      onChange={(m) => update(idx, { moneda: m })}
                    />
                    <span
                      className="ml-auto font-mono text-sm tabular-nums"
                      title="Cantidad × precio unitario: lo deriva el motor al recalcular"
                    >
                      = {referencia != null ? fmt(referencia) : "—"}
                    </span>
                  </>
                ) : (
                  <>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder={esMxn ? "MXN" : "USD"}
                      aria-label="Monto del extra"
                      value={e.monto_usd || ""}
                      onChange={(ev) =>
                        update(idx, { monto_usd: Number(ev.target.value) || 0 })
                      }
                      className="h-8 w-28 text-right font-mono"
                    />
                    <MonedaSelect
                      value={esMxn ? "MXN" : "USD"}
                      onChange={(m) => update(idx, { moneda: m })}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => toggleDetalles(idx)}
                  aria-expanded={detalles}
                  aria-label="Más opciones del renglón (IVA, por persona, cantidad × precio)"
                  title="IVA propio · por persona · cantidad × precio"
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                    detalles
                      ? "border-foreground/40 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label="Quitar este concepto"
                  title="Quitar"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              {(e.aplica_iva === false || e.por_persona === true) && !detalles && (
                <p className="text-[10px] text-muted-foreground">
                  {[
                    e.aplica_iva === false ? "sin IVA" : null,
                    e.por_persona === true
                      ? `por persona${pasajeros != null && pasajeros > 0 ? ` (${pasajeros} pax)` : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {detalles && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <div
                    role="group"
                    aria-label="Cómo se captura este concepto"
                    className="inline-flex shrink-0 rounded-md border border-border p-0.5 text-[11px]"
                  >
                    <button
                      type="button"
                      aria-pressed={!usaUnitario}
                      onClick={() => usaUnitario && setModo(idx, false)}
                      className={cn(
                        "rounded px-2 py-0.5 transition-colors",
                        !usaUnitario
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Monto
                    </button>
                    <button
                      type="button"
                      aria-pressed={usaUnitario}
                      onClick={() => !usaUnitario && setModo(idx, true)}
                      className={cn(
                        "rounded px-2 py-0.5 transition-colors",
                        usaUnitario
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Cantidad × precio
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={e.aplica_iva ?? true}
                      onCheckedChange={(c) => update(idx, { aplica_iva: c })}
                    />
                    Entra a la base de IVA
                  </label>
                  {usaUnitario && (
                    <label
                      className="flex items-center gap-2 text-muted-foreground"
                      title="La cantidad son los pasajeros del vuelo: si cambian, el extra se recalcula solo."
                    >
                      <Switch
                        size="sm"
                        checked={e.por_persona === true}
                        onCheckedChange={(c) =>
                          update(idx, {
                            por_persona: c,
                            ...(c
                              ? {}
                              : { cantidad: cantidadEfectiva(e, pasajeros) ?? e.cantidad ?? 1 }),
                          })
                        }
                      />
                      Por persona
                    </label>
                  )}
                </div>
              )}
              {mxnSinTc &&
                (onFocusTc ? (
                  <button
                    type="button"
                    onClick={onFocusTc}
                    className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
                  >
                    Captura el T.C. (abajo, en «Total MXN») — sin tipo de cambio
                    este extra en MXN no entra al total.
                  </button>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {sinTcTexto ??
                      "Sin tipo de cambio este extra en MXN no entra al total."}
                  </p>
                ))}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => add()}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            concepto
          </button>
          {EXTRAS_SUGERIDOS.filter(
            (sug) => !value.some((e) => e.concepto.toLowerCase() === sug.toLowerCase()),
          ).map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => add(sug)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              + {sug}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Conceptos extra</Label>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Handler, comisariato, extensión de servicios… se suman al total sin
          salir de esta pantalla. Cada renglón puede ir por monto o por
          cantidad × precio (p. ej. «Camionetas 2 × $250»).
        </p>
      )}
      {value.map((e, idx) => {
        const bloqueado = esExtraDeGrupo(e);
        const usaUnitario = extraUsaUnitario(e);
        const esMxn = e.moneda === "MXN";
        const referencia = montoReferencia(e, pasajeros);
        const fmt = esMxn ? fmtMxn : fmtUsd;

        if (bloqueado) {
          return (
            <div
              key={idx}
              className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-2.5 space-y-1"
              title="Concepto del grupo: se materializó desde la cotización de grupo y solo se cambia allá."
            >
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <LockClosedIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
                  <span className="truncate font-medium">{e.concepto}</span>
                  {e.aplica_iva === false && (
                    <span className="text-[10px] text-muted-foreground">(sin IVA)</span>
                  )}
                </span>
                <span className="font-mono text-xs shrink-0">
                  {usaUnitario ? (
                    <>
                      {textoCantidadUnitario(e, pasajeros)}
                      {referencia != null && (
                        <span className="ml-1 text-muted-foreground">= {fmt(referencia)}</span>
                      )}
                    </>
                  ) : (
                    fmt(Number(e.monto_usd) || 0)
                  )}
                </span>
              </div>
              <p className="text-[11px] text-fuchsia-700/90 dark:text-fuchsia-300/90">
                {notaGrupo}
                {e.por_persona ? " · por persona (la cantidad la fija el grupo)" : ""}
              </p>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className="rounded-lg border border-border bg-navy-800/50 p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                placeholder="Concepto (ej. Handler)"
                value={e.concepto}
                onChange={(ev) => update(idx, { concepto: ev.target.value })}
                className="flex-1"
              />
              {/* Modo del renglón: dos botones claros, sin opciones ambiguas. */}
              <div
                role="group"
                aria-label="Cómo se captura este concepto"
                className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-[11px]"
              >
                <button
                  type="button"
                  aria-pressed={!usaUnitario}
                  onClick={() => usaUnitario && setModo(idx, false)}
                  className={cn(
                    "rounded-md px-2 py-1 transition-colors",
                    !usaUnitario
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Monto
                </button>
                <button
                  type="button"
                  aria-pressed={usaUnitario}
                  onClick={() => !usaUnitario && setModo(idx, true)}
                  className={cn(
                    "rounded-md px-2 py-1 transition-colors",
                    usaUnitario
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Cantidad × precio
                </button>
              </div>
            </div>

            {usaUnitario ? (
              <div className="grid grid-cols-[72px_1fr_76px_1fr] gap-2 items-end">
                <div className="space-y-1">
                  <span className="block text-[10px] text-muted-foreground">Cantidad</span>
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    disabled={e.por_persona === true}
                    title={
                      e.por_persona
                        ? "Por persona: la cantidad son los pasajeros del vuelo"
                        : undefined
                    }
                    value={
                      e.por_persona
                        ? (cantidadEfectiva(e, pasajeros) ?? "")
                        : (e.cantidad ?? "")
                    }
                    onChange={(ev) =>
                      update(idx, { cantidad: Math.max(0, Number(ev.target.value) || 0) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] text-muted-foreground">
                    Precio unitario {esMxn ? "(MXN)" : "(USD)"}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={esMxn ? "MXN" : "USD"}
                    value={e.unitario || ""}
                    onChange={(ev) =>
                      update(idx, { unitario: Number(ev.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] text-muted-foreground">Moneda</span>
                  <MonedaSelect
                    value={esMxn ? "MXN" : "USD"}
                    onChange={(m) => update(idx, { moneda: m })}
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] text-muted-foreground">
                    Monto (lo calcula el sistema)
                  </span>
                  <Input
                    disabled
                    readOnly
                    value={referencia != null ? fmt(referencia) : "—"}
                    title="Cantidad × precio unitario: lo deriva el motor al recalcular"
                    className="font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_96px_76px] gap-2">
                <div />
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  // El monto es NATIVO en la moneda del renglón (MXN entra al
                  // total en pesos tal cual; requiere TC capturado).
                  placeholder={esMxn ? "MXN" : "USD"}
                  value={e.monto_usd || ""}
                  onChange={(ev) =>
                    update(idx, { monto_usd: Number(ev.target.value) || 0 })
                  }
                />
                <MonedaSelect
                  value={esMxn ? "MXN" : "USD"}
                  onChange={(m) => update(idx, { moneda: m })}
                />
              </div>
            )}

            {/* Extra MXN sin TC: se retiene fuera del cálculo (no tira el
                preview con el 400 del motor) y guardar queda bloqueado. */}
            {esMxn &&
              (usaUnitario ? Number(e.unitario) > 0 : Number(e.monto_usd) > 0) &&
              !tcCapturado &&
              (onFocusTc ? (
                <button
                  type="button"
                  onClick={onFocusTc}
                  className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
                >
                  Captura el TC en «Cobro y cierre» — sin tipo de cambio este
                  extra en MXN no entra al total.
                </button>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {sinTcTexto ??
                    "Sin tipo de cambio este extra en MXN no entra al total."}
                </p>
              ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={e.aplica_iva ?? true}
                    onCheckedChange={(c) => update(idx, { aplica_iva: c })}
                  />
                  Entra a la base de IVA
                </label>
                {usaUnitario && (
                  <label
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    title="La cantidad son los pasajeros del vuelo: si cambian, el extra se recalcula solo."
                  >
                    <Switch
                      checked={e.por_persona === true}
                      onCheckedChange={(c) =>
                        update(idx, {
                          por_persona: c,
                          // Al apagarlo se conserva la última cantidad efectiva
                          // como punto de partida (en vez de dejar 0).
                          ...(c
                            ? {}
                            : { cantidad: cantidadEfectiva(e, pasajeros) ?? e.cantidad ?? 1 }),
                        })
                      }
                    />
                    Por persona
                    {e.por_persona && pasajeros != null && pasajeros > 0 && (
                      <span className="font-mono">({pasajeros} pax)</span>
                    )}
                  </label>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-xs text-destructive hover:opacity-80 transition-opacity"
              >
                Quitar
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add()}
          className="gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar concepto
        </Button>
        {EXTRAS_SUGERIDOS.filter(
          (sug) => !value.some((e) => e.concepto.toLowerCase() === sug.toLowerCase()),
        ).map((sug) => (
          <button
            key={sug}
            type="button"
            onClick={() => add(sug)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            + {sug}
          </button>
        ))}
      </div>
    </div>
  );
}
