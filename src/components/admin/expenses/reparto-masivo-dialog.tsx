"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import {
  listAvionesActivosAction,
  saveRepartoMasivoAction,
} from "@/app/admin/expenses/actions";

/** Lo mínimo de cada gasto seleccionado (viene de las filas de la tabla). */
export interface GastoMasivo {
  id: string;
  monto: number;
  moneda: string;
  fecha_gasto: string | null;
  descripcion: string | null;
  /** true si el gasto YA tiene reparto vigente: se reemplazará al confirmar. */
  tieneReparto: boolean;
}

/** Formato explícito por moneda (regla del repo: MXN nunca se confunde con USD). */
const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

/** MXN primero, luego USD; cualquier otra moneda al final. */
const ordenMoneda = (m: string) => (m === "MXN" ? 0 : m === "USD" ? 1 : 2);

/**
 * Porcentajes en CENTÉSIMAS de punto enteras (100% = 10000): las sumas del
 * reparto no admiten flotantes — misma disciplina que los centavos del
 * reparto unitario.
 */
const toBp = (v: string | number) => Math.round(Number(v) * 100);

/** "12.5" → "12.50 %", "100" → "100 %": sin decimales fantasma. */
const fmtPct = (bp: number) =>
  `${bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2)} %`;

interface AvionOpcion {
  id: string;
  matricula: string;
  modelo: string;
}

interface SeleccionPct {
  incluir: boolean;
  porcentaje: string;
}

/**
 * Reparto MASIVO por porcentajes: el mismo % por avión se aplica a TODOS los
 * gastos seleccionados (cada gasto reparte su propio monto). Variante del
 * RepartoDialog unitario; el reparto vigente de cada gasto se REEMPLAZA.
 * Solo vive en /admin/otros-gastos.
 */
export function RepartoMasivoDialog({
  open,
  onOpenChange,
  gastos,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gastos: GastoMasivo[];
  /** Al aplicar (aunque haya errores por gasto): limpiar la selección. */
  onSuccess: () => void;
}) {
  const [aviones, setAviones] = useState<AvionOpcion[] | null>(null);
  const [seleccion, setSeleccion] = useState<Record<string, SeleccionPct>>({});
  const [cargaFallo, setCargaFallo] = useState(false);
  const [pending, startTransition] = useTransition();

  // Al abrir: aviones ACTIVOS y porcentajes en blanco (cada apertura es un
  // reparto nuevo — no hay "reparto vigente" que prellenar en masivo).
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    listAvionesActivosAction().then((res) => {
      if (!vigente) return;
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudieron cargar los aviones activos");
        setCargaFallo(true);
        return;
      }
      const sel: Record<string, SeleccionPct> = {};
      for (const a of res.data) sel[a.id] = { incluir: false, porcentaje: "" };
      setAviones(res.data);
      setSeleccion(sel);
      setCargaFallo(false);
    });
    return () => {
      vigente = false;
    };
  }, [open]);

  const cargando = aviones === null && !cargaFallo;

  const incluidos = useMemo(
    () => (aviones ?? []).filter((a) => seleccion[a.id]?.incluir),
    [aviones, seleccion],
  );
  const sumaBp = useMemo(
    () =>
      incluidos.reduce((acc, a) => {
        const n = Number(seleccion[a.id]?.porcentaje);
        return acc + (Number.isFinite(n) && n > 0 ? toBp(n) : 0);
      }, 0),
    [incluidos, seleccion],
  );
  const excedido = sumaBp > 10000;
  const sinPorcentaje = incluidos.filter(
    (a) => !(Number(seleccion[a.id]?.porcentaje) > 0),
  );

  // Resumen de los seleccionados: conteo + total POR MONEDA (nunca mezclar).
  const totales = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gastos)
      m.set(g.moneda, (m.get(g.moneda) ?? 0) + Math.round(g.monto * 100));
    return [...m.entries()]
      .sort((a, b) => ordenMoneda(a[0]) - ordenMoneda(b[0]))
      .map(([moneda, cents]) => ({ moneda, total: cents / 100 }));
  }, [gastos]);

  const conReparto = useMemo(
    () => gastos.filter((g) => g.tieneReparto),
    [gastos],
  );

  /**
   * Partes iguales con Σ == 100% EXACTO: base = round(100/n, 2) y el PRIMERO
   * absorbe la diferencia (disciplina de residuo del repo — misma que
   * dividirIguales del reparto unitario).
   */
  const partesIguales = () => {
    const n = incluidos.length;
    if (n === 0) {
      toast.error("Marca primero los aviones entre los que se divide");
      return;
    }
    const base = Math.round(10000 / n);
    const primero = 10000 - base * (n - 1);
    setSeleccion((s) => {
      const next = { ...s };
      incluidos.forEach((a, i) => {
        next[a.id] = {
          incluir: true,
          porcentaje: ((i === 0 ? primero : base) / 100).toFixed(2),
        };
      });
      return next;
    });
  };

  /** Etiqueta legible de un gasto para el reporte de errores por fila. */
  const etiquetaGasto = (id: string): string => {
    const g = gastos.find((x) => x.id === id);
    if (!g) return `Gasto ${id.slice(0, 8)}…`;
    const fecha = g.fecha_gasto ? fmtDateOnly(g.fecha_gasto) : "Sin fecha";
    return `${fecha} · ${g.descripcion ?? "Sin descripción"} · ${fmtMonto(g.monto, g.moneda)}`;
  };

  const confirmar = () => {
    if (gastos.length === 0 || incluidos.length === 0) return;
    const items = incluidos.map((a) => ({
      aeronave_id: a.id,
      porcentaje: Math.round(Number(seleccion[a.id].porcentaje) * 100) / 100,
    }));
    startTransition(async () => {
      const res = await saveRepartoMasivoAction(
        gastos.map((g) => g.id),
        items,
      );
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo aplicar el reparto masivo");
        return;
      }
      const { procesados, exitos, errores } = res.data;
      if (errores.length === 0) {
        toast.success(
          `Reparto aplicado a ${exitos} ${exitos === 1 ? "gasto" : "gastos"}`,
        );
      } else {
        // Errores POR GASTO, legibles: qué fila falló y por qué.
        toast.error(
          <div className="space-y-1">
            <p className="font-medium">
              Reparto aplicado a {exitos} de {procesados};{" "}
              {errores.length === 1
                ? "1 gasto con error"
                : `${errores.length} gastos con error`}
              :
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {errores.map((e) => (
                <li key={e.gasto_id}>
                  {etiquetaGasto(e.gasto_id)} — {e.error}
                </li>
              ))}
            </ul>
          </div>,
          { duration: 12000 },
        );
      }
      onSuccess();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Repartir seleccionados entre aviones</DialogTitle>
          <DialogDescription>
            El mismo porcentaje por avión se aplica a TODOS los gastos
            seleccionados (cada gasto reparte su propio monto). Lo que no
            asignes queda como gasto de la empresa VuelaTour (no resta a
            ningún avión).
          </DialogDescription>
          <p className="text-xs text-slate-400">
            Cada parcial cae en la hoja Gastos Indirectos del balance del
            avión que elijas (con la nota reparto manual).
          </p>
        </DialogHeader>

        {/* Resumen: cuántos gastos y cuánto dinero POR MONEDA. */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {gastos.length}{" "}
              {gastos.length === 1
                ? "gasto seleccionado"
                : "gastos seleccionados"}
            </Badge>
            <span className="ml-auto flex items-center gap-3">
              {totales.map((t) => (
                <span
                  key={t.moneda}
                  className="font-mono text-sm font-semibold"
                >
                  {fmtMonto(t.total, t.moneda)}
                </span>
              ))}
            </span>
          </div>
        </div>

        {/* AVISO destacado: el masivo PISA repartos existentes (regla del
            cliente: confirmar antes de pisar datos). */}
        {conReparto.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {conReparto.length === 1
                ? "1 de los gastos seleccionados YA tiene reparto: al confirmar se "
                : `${conReparto.length} de los gastos seleccionados YA tienen reparto: al confirmar se `}
              <strong>REEMPLAZARÁ su reparto actual</strong> por estos
              porcentajes.
            </p>
          </div>
        )}

        {cargando ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando aviones…
          </p>
        ) : cargaFallo ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No se pudieron cargar los aviones activos. Cierra el diálogo y
            vuelve a intentar.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Marca los aviones y captura el porcentaje de cada uno.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={partesIguales}
                disabled={pending || incluidos.length === 0}
              >
                <ArrowsRightLeftIcon className="h-4 w-4" />
                Partes iguales
              </Button>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              {(aviones ?? []).map((a) => {
                const sel = seleccion[a.id] ?? { incluir: false, porcentaje: "" };
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={sel.incluir}
                      onChange={(e) =>
                        setSeleccion((s) => ({
                          ...s,
                          [a.id]: { ...sel, incluir: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="font-mono text-sm font-medium">
                      {a.matricula}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {a.modelo}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        inputMode="decimal"
                        value={sel.porcentaje}
                        placeholder="0.00"
                        disabled={!sel.incluir}
                        onChange={(e) =>
                          setSeleccion((s) => ({
                            ...s,
                            [a.id]: { ...sel, porcentaje: e.target.value },
                          }))
                        }
                        className="h-8 w-24 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </span>
                  </label>
                );
              })}
              {(aviones ?? []).length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin aviones activos para repartir.
                </p>
              )}
            </div>

            {/* Línea viva SIEMPRE visible: cuánto % va asignado y cuánto
                absorbe la empresa. En rojo si la suma se pasa de 100%. */}
            <p
              className={
                excedido
                  ? "text-sm font-medium text-red-600 dark:text-red-400"
                  : "text-sm text-muted-foreground"
              }
            >
              Asignado {fmtPct(sumaBp)} ·{" "}
              {excedido
                ? `se pasa por ${fmtPct(sumaBp - 10000)} — ajusta los porcentajes`
                : `VuelaTour absorbe ${fmtPct(10000 - sumaBp)}`}
            </p>
            {sinPorcentaje.length > 0 && (
              <p className="text-xs text-amber-600">
                Captura el porcentaje de{" "}
                {sinPorcentaje.map((a) => a.matricula).join(", ")} (o
                desmárcalos).
              </p>
            )}
          </>
        )}

        <DialogFooter className="items-center gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={
              pending ||
              cargando ||
              cargaFallo ||
              excedido ||
              gastos.length === 0 ||
              incluidos.length === 0 ||
              sinPorcentaje.length > 0
            }
          >
            {pending
              ? "Aplicando…"
              : `Aplicar a ${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
