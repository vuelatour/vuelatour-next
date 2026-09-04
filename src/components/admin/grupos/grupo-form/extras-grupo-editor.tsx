"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { REPARTO_EXTRA_LABEL } from "@/lib/admin/grupos-ui";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ArmadoGrupo, RepartoExtraGrupo } from "@/types/grupos";
import { extraVacio, type ExtraGrupoForm } from "./types";

const EXTRAS_SUGERIDOS = ["Tour", "Camionetas", "Guía", "Handler"];

/**
 * Monto de la línea EXTRA i en el consolidado del server (por id del extra
 * normalizado en la misma posición). null = aún no calculado o incompleto.
 */
function montoServer(armado: ArmadoGrupo | null, idx: number): number | null {
  const def = armado?.extras_grupo[idx];
  if (!def) return null;
  const linea = armado?.consolidado.desglose.find(
    (l) => l.clave === "EXTRA" && l.grupo_extra_id === def.id,
  );
  return linea ? linea.monto_usd : null;
}

/** Misma regla que `extrasPayload`: solo las líneas completas viajan al armador. */
function esCompleta(e: ExtraGrupoForm): boolean {
  return (
    e.concepto.trim() !== "" &&
    e.unitario !== "" &&
    Number(e.unitario) >= 0 &&
    (e.por_persona || (e.cantidad !== "" && Number(e.cantidad) >= 0))
  );
}

/**
 * Índice de cada fila dentro de la lista que viajó al armador (solo las
 * completas cuentan); null si la fila está a medias.
 */
function indicesServer(value: ExtraGrupoForm[]): (number | null)[] {
  const out: (number | null)[] = [];
  let n = -1;
  for (const e of value) {
    if (esCompleta(e)) {
      n += 1;
      out.push(n);
    } else {
      out.push(null);
    }
  }
  return out;
}

/**
 * Extras del GRUPO: concepto + precio unitario (con moneda) y el interruptor
 * "por persona" (default ON ⇒ cantidad = pasajeros del grupo y cada avión
 * lleva la parte de sus pasajeros). Apagado, se captura la cantidad y cómo
 * repartirlo entre los aviones. El monto de cada línea lo devuelve el
 * armador (consolidado): aquí no se multiplica nada.
 */
export function ExtrasGrupoEditor({
  value,
  onChange,
  pasajerosTotal,
  tcCapturado,
  armado,
  onFocusTc,
  disabled = false,
}: {
  value: ExtraGrupoForm[];
  onChange: (extras: ExtraGrupoForm[]) => void;
  pasajerosTotal: number;
  tcCapturado: boolean;
  /** Preview vigente (para pintar el monto calculado de cada línea). */
  armado: ArmadoGrupo | null;
  onFocusTc?: () => void;
  disabled?: boolean;
}) {
  const update = (idx: number, patch: Partial<ExtraGrupoForm>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const add = (concepto = "") => onChange([...value, extraVacio(concepto)]);
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const idxServer = indicesServer(value);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Cargos del grupo</Label>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Tour por persona, camionetas, guía, handler… Cada cargo se reparte a los
          aviones y el PDF lo muestra como una sola línea del grupo.
        </p>
      )}
      {value.map((e, idx) => {
        const enServer = idxServer[idx];
        const completa = enServer != null;
        const monto = completa ? montoServer(armado, enServer) : null;
        const cantidadTexto = e.por_persona ? `${pasajerosTotal || "—"} pax` : `${e.cantidad || "—"}`;
        const unitarioTexto =
          e.unitario === ""
            ? "—"
            : e.moneda === "MXN"
              ? fmtMxn(Number(e.unitario))
              : fmtUsd(Number(e.unitario));
        return (
          <div
            key={e.uid}
            className="rounded-lg border border-border bg-navy-800/50 p-2.5 space-y-2"
          >
            <div className="grid grid-cols-[1fr_110px_76px] gap-2">
              <Input
                placeholder="Concepto (ej. Tour Chichén Itzá)"
                disabled={disabled}
                value={e.concepto}
                onChange={(ev) => update(idx, { concepto: ev.target.value })}
                maxLength={120}
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                disabled={disabled}
                placeholder={e.moneda === "MXN" ? "MXN c/u" : "USD c/u"}
                value={e.unitario}
                onChange={(ev) =>
                  update(idx, {
                    unitario: ev.target.value === "" ? "" : Math.max(0, Number(ev.target.value)),
                  })
                }
              />
              <MonedaSelect
                value={e.moneda}
                disabled={disabled}
                onChange={(m) => update(idx, { moneda: m })}
              />
            </div>
            {e.moneda === "MXN" && Number(e.unitario) > 0 && !tcCapturado && (
              <button
                type="button"
                onClick={onFocusTc}
                className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
              >
                Captura el tipo de cambio en «Cliente y grupo» — sin TC este cargo en
                MXN no entra al total.
              </button>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  disabled={disabled}
                  checked={e.por_persona}
                  onCheckedChange={(c) =>
                    update(idx, {
                      por_persona: c,
                      reparto: c ? "POR_PAX" : e.reparto === "POR_PAX" ? "PROPORCIONAL" : e.reparto,
                    })
                  }
                />
                Por persona
              </label>
              {!e.por_persona && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Cantidad
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    disabled={disabled}
                    placeholder="Ej. 3"
                    className="h-7 w-20"
                    value={e.cantidad}
                    onChange={(ev) =>
                      update(idx, {
                        cantidad:
                          ev.target.value === "" ? "" : Math.max(0, Number(ev.target.value)),
                      })
                    }
                  />
                </label>
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  disabled={disabled}
                  checked={e.aplica_iva}
                  onCheckedChange={(c) => update(idx, { aplica_iva: c })}
                />
                Entra a la base de IVA
              </label>
            </div>
            {/* Cómo llega a cada avión: por persona es automático (cada avión
                lleva la parte de sus pasajeros); con cantidad fija se elige. */}
            {e.por_persona ? (
              <p className="text-[11px] text-muted-foreground">
                {REPARTO_EXTRA_LABEL.POR_PAX}: cada avión lleva la parte de sus
                pasajeros ({cantidadTexto} × {unitarioTexto}).
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {cantidadTexto} × {unitarioTexto} · ¿cómo se reparte entre los aviones?
                </p>
                <div className="inline-flex w-full rounded-lg border border-border bg-navy-800/50 p-1">
                  {(["PROPORCIONAL", "ANCLA"] as RepartoExtraGrupo[]).map((r) => {
                    const active = e.reparto === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={disabled}
                        onClick={() => update(idx, { reparto: r })}
                        title={
                          r === "ANCLA"
                            ? "Toda la línea va al avión ancla del grupo (el de mayor total)."
                            : "El monto se reparte a los aviones según sus pasajeros (centavos al ancla)."
                        }
                        className={cn(
                          "flex-1 h-7 px-2 text-xs font-medium rounded-md transition-colors",
                          active
                            ? "bg-navy-700 text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {REPARTO_EXTRA_LABEL[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {monto != null
                  ? `= ${fmtUsd(monto)} USD en el grupo`
                  : completa
                    ? "calculando…"
                    : "completa concepto y precio"}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-xs text-destructive hover:opacity-80 transition-opacity"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => add()} className="gap-1.5">
            <PlusIcon className="h-3.5 w-3.5" />
            Agregar cargo
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
      )}
    </div>
  );
}
