"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  getRepartoAction,
  listAvionesActivosAction,
  saveRepartoAction,
} from "@/app/admin/expenses/actions";

/** Lo mínimo del gasto para encabezar el diálogo (viene de la fila). */
export interface RepartoGasto {
  id: string;
  categoria: string;
  /** Monto TOTAL del gasto (techo del reparto), en su moneda. */
  monto: number;
  moneda: string;
  fecha_gasto: string | null;
  /** Primera línea de notas · proveedor, para reconocer el gasto. */
  descripcion: string | null;
}

/** Formato explícito por moneda (regla del repo: MXN nunca se confunde con USD). */
const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

/** Dinero en centavos enteros: las sumas del reparto no admiten flotantes. */
const toCents = (v: string | number) => Math.round(Number(v) * 100);

interface AvionOpcion {
  id: string;
  matricula: string;
  modelo: string;
  /** true si viene de un reparto viejo con un avión ya inactivo. */
  inactivo?: boolean;
}

interface Seleccion {
  incluir: boolean;
  monto: string;
}

/**
 * Reparto de un gasto general (OTRO/FIJO/INDIRECTO sin vuelo) entre aviones:
 * la oficina asigna o divide el monto con importes editables. Lo que no se
 * asigna lo absorbe VuelaTour (empresa) — la fila del gasto nunca se parte.
 * Reutilizado por /admin/otros-gastos y por el menú ⋯ de /admin/expenses.
 */
export function RepartoDialog({
  open,
  onOpenChange,
  gasto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: RepartoGasto | null;
}) {
  const [aviones, setAviones] = useState<AvionOpcion[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, Seleccion>>({});
  const [teniaReparto, setTeniaReparto] = useState(false);
  // Qué gasto está cargado (y si su carga falló): "cargando" se DERIVA de
  // comparar con el gasto abierto — sin setState síncrono en el effect.
  const [cargaEstado, setCargaEstado] = useState<{
    key: string | null;
    error: boolean;
  }>({ key: null, error: false });
  const [openQuitar, setOpenQuitar] = useState(false);
  const [pending, startTransition] = useTransition();

  // Al abrir: aviones ACTIVOS + reparto vigente (prellenado). Solo depende
  // del id: el resto del gasto es informativo del encabezado.
  const key = open ? (gasto?.id ?? null) : null;
  useEffect(() => {
    if (!key) return;
    let vigente = true;
    Promise.all([listAvionesActivosAction(), getRepartoAction(key)]).then(
      ([avRes, repRes]) => {
        if (!vigente) return;
        if (!avRes.ok || !avRes.data || !repRes.ok || !repRes.data) {
          toast.error(
            (avRes.ok ? repRes.error : avRes.error) ??
              "No se pudo cargar el reparto del gasto",
          );
          setCargaEstado({ key, error: true });
          return;
        }
        const items = repRes.data.items;
        const opciones: AvionOpcion[] = [...avRes.data];
        // Un reparto viejo puede traer un avión hoy inactivo: se muestra para
        // no perderlo en silencio al guardar.
        for (const it of items) {
          if (!opciones.some((a) => a.id === it.aeronave_id)) {
            opciones.push({
              id: it.aeronave_id,
              matricula: it.matricula,
              modelo: "Inactivo",
              inactivo: true,
            });
          }
        }
        const sel: Record<string, Seleccion> = {};
        for (const a of opciones) sel[a.id] = { incluir: false, monto: "" };
        for (const it of items) {
          sel[it.aeronave_id] = {
            incluir: true,
            monto: (toCents(it.monto) / 100).toFixed(2),
          };
        }
        setAviones(opciones);
        setSeleccion(sel);
        setTeniaReparto(items.length > 0);
        setCargaEstado({ key, error: false });
      },
    );
    return () => {
      vigente = false;
    };
  }, [key]);

  const cargando = key != null && cargaEstado.key !== key;
  const cargaFallo = key != null && cargaEstado.key === key && cargaEstado.error;

  const totalCents = gasto ? Math.round(gasto.monto * 100) : 0;
  const incluidos = useMemo(
    () => aviones.filter((a) => seleccion[a.id]?.incluir),
    [aviones, seleccion],
  );
  const sumaCents = useMemo(
    () =>
      incluidos.reduce((acc, a) => {
        const n = Number(seleccion[a.id]?.monto);
        return acc + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
      }, 0),
    [incluidos, seleccion],
  );
  const excedido = sumaCents > totalCents;
  const sinMonto = incluidos.filter((a) => !(Number(seleccion[a.id]?.monto) > 0));

  /**
   * Partes iguales entre los seleccionados con Σ == total EXACTO: base =
   * round(total/n, 2) y el PRIMERO absorbe la diferencia (disciplina de
   * residuo del repo — patrón crearGastosDeSalidaFlota de inventario).
   */
  const dividirIguales = () => {
    const n = incluidos.length;
    if (n === 0) {
      toast.error("Marca primero los aviones entre los que se divide");
      return;
    }
    const base = Math.round(totalCents / n);
    const primero = totalCents - base * (n - 1);
    setSeleccion((s) => {
      const next = { ...s };
      incluidos.forEach((a, i) => {
        next[a.id] = {
          incluir: true,
          monto: ((i === 0 ? primero : base) / 100).toFixed(2),
        };
      });
      return next;
    });
  };

  const guardar = () => {
    if (!gasto) return;
    const items = incluidos.map((a) => ({
      aeronave_id: a.id,
      monto: Math.round(Number(seleccion[a.id].monto) * 100) / 100,
    }));
    startTransition(async () => {
      const res = await saveRepartoAction(gasto.id, items);
      if (res.ok) {
        toast.success("Reparto guardado");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo guardar el reparto");
      }
    });
  };

  const quitar = () => {
    if (!gasto) return;
    startTransition(async () => {
      const res = await saveRepartoAction(gasto.id, []);
      if (res.ok) {
        toast.success("Reparto eliminado: el gasto queda 100% de VuelaTour");
        setOpenQuitar(false);
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo quitar el reparto");
      }
    });
  };

  if (!gasto) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repartir entre aviones</DialogTitle>
            <DialogDescription>
              Asigna o divide este gasto entre los aviones que elijas, con
              montos editables. Lo que no asignes queda como gasto de la
              empresa VuelaTour (no resta a ningún avión).
            </DialogDescription>
            <p className="text-xs text-slate-400">
              Cada parcial cae en la hoja Gastos Indirectos del balance del
              avión que elijas (con la nota reparto manual).
            </p>
          </DialogHeader>

          {/* Encabezado del gasto: para saber QUÉ se está repartiendo. */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{categoriaGastoLabel(gasto.categoria)}</Badge>
              <span className="text-xs text-muted-foreground">
                {gasto.fecha_gasto ? fmtDateOnly(gasto.fecha_gasto) : "Sin fecha"}
              </span>
              <span className="ml-auto font-mono text-sm font-semibold">
                {fmtMonto(gasto.monto, gasto.moneda)}
              </span>
            </div>
            {gasto.descripcion && (
              <p className="text-sm text-muted-foreground">{gasto.descripcion}</p>
            )}
          </div>

          {cargando ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando aviones y reparto…
            </p>
          ) : cargaFallo ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No se pudo cargar el reparto del gasto. Cierra el diálogo y
              vuelve a intentar.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Marca los aviones y captura cuánto le toca a cada uno.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={dividirIguales}
                  disabled={pending || incluidos.length === 0}
                >
                  <ArrowsRightLeftIcon className="h-4 w-4" />
                  Dividir en partes iguales
                </Button>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border">
                {aviones.map((a) => {
                  const sel = seleccion[a.id] ?? { incluir: false, monto: "" };
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
                      {a.inactivo && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 text-amber-600 text-[10px]"
                        >
                          Inactivo
                        </Badge>
                      )}
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={sel.monto}
                        placeholder="0.00"
                        disabled={!sel.incluir}
                        onChange={(e) =>
                          setSeleccion((s) => ({
                            ...s,
                            [a.id]: { ...sel, monto: e.target.value },
                          }))
                        }
                        className="h-8 w-28 text-right ml-auto"
                      />
                    </label>
                  );
                })}
                {aviones.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Sin aviones activos para repartir.
                  </p>
                )}
              </div>

              {/* Línea viva SIEMPRE visible: cuánto va asignado y cuánto
                  absorbe la empresa. En rojo si la suma se pasa del total. */}
              <p
                className={
                  excedido
                    ? "text-sm font-medium text-red-600 dark:text-red-400"
                    : "text-sm text-muted-foreground"
                }
              >
                Asignado {fmtMonto(sumaCents / 100, gasto.moneda)} de{" "}
                {fmtMonto(totalCents / 100, gasto.moneda)} ·{" "}
                {excedido
                  ? `se pasa por ${fmtMonto((sumaCents - totalCents) / 100, gasto.moneda)} — ajusta los montos`
                  : `VuelaTour absorbe ${fmtMonto(Math.max(0, totalCents - sumaCents) / 100, gasto.moneda)}`}
              </p>
              {sinMonto.length > 0 && (
                <p className="text-xs text-amber-600">
                  Captura el monto de {sinMonto.map((a) => a.matricula).join(", ")}{" "}
                  (o desmárcalos).
                </p>
              )}
            </>
          )}

          <DialogFooter className="items-center gap-2">
            {teniaReparto && !cargando && !cargaFallo && (
              <Button
                variant="outline"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() => setOpenQuitar(true)}
                disabled={pending}
              >
                Quitar reparto
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              disabled={
                pending ||
                cargando ||
                cargaFallo ||
                excedido ||
                incluidos.length === 0 ||
                sinMonto.length > 0
              }
            >
              {pending ? "Guardando…" : "Guardar reparto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={openQuitar} onOpenChange={setOpenQuitar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el reparto de este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              El gasto queda 100% como gasto de VuelaTour (empresa): no
              restará a ningún avión. Puedes volver a repartirlo cuando
              quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                quitar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar reparto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
