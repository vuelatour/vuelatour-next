"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowsRightLeftIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MEDIO_PAGO_LABELS } from "@/components/admin/expenses/expenses-table";
import {
  RepartoDialog,
  type RepartoGasto,
} from "@/components/admin/expenses/reparto-dialog";
import { RepartoMasivoDialog } from "@/components/admin/expenses/reparto-masivo-dialog";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { cn } from "@/lib/utils";

/** Fila serializable armada por el server component de /admin/otros-gastos. */
export interface OtroGastoRow {
  id: string;
  fecha_gasto: string | null;
  categoria: string;
  /** Primera línea de notas · proveedor. */
  descripcion: string | null;
  notas: string | null;
  monto: number;
  moneda: string;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  /** Avión clásico del gasto (para ligar la matrícula a su ficha). */
  aeronave_id: string | null;
  /** Matrícula del avión clásico (aeronave_id del gasto), si tiene. */
  matricula: string | null;
  /** Reparto entre aviones (tabla hija); vacío = sin reparto. */
  repartos: Array<{ aeronave_id: string; matricula: string | null; monto: number }>;
  /** monto − Σ repartos: la parte de VuelaTour cuando HAY reparto. */
  remanente: number;
}

const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

/** MXN primero, luego USD; cualquier otra moneda al final. */
const ordenMoneda = (m: string) => (m === "MXN" ? 0 : m === "USD" ? 1 : 2);

// El texto del badge sale de la FUENTE ÚNICA categoriaGastoLabel; aquí solo
// viven los colores.
const CATEGORIA_BADGE: Record<string, string> = {
  OTRO: "border-border text-foreground",
  FIJO: "border-sky-500/50 text-sky-600",
  INDIRECTO: "border-violet-500/50 text-violet-600",
  NOMINA: "border-emerald-500/50 text-emerald-600",
  GASOLINA: "border-amber-500/50 text-amber-600",
  VISITA: "border-teal-500/50 text-teal-600",
};

const CATEGORIAS_FILTRO = [
  "TODAS",
  "OTRO",
  "FIJO",
  "INDIRECTO",
  "NOMINA",
  "GASOLINA",
  "VISITA",
] as const;
type CategoriaFiltro = (typeof CATEGORIAS_FILTRO)[number];

/**
 * Tabla de Otros gastos con filtro de categoría (client-side: el mes ya
 * viene acotado del server) y el diálogo de reparto compartido por fila.
 */
export function OtrosGastosTable({ gastos }: { gastos: OtroGastoRow[] }) {
  const [categoria, setCategoria] = useState<CategoriaFiltro>("TODAS");
  const [repartoGasto, setRepartoGasto] = useState<RepartoGasto | null>(null);
  const [openReparto, setOpenReparto] = useState(false);
  // Selección para el reparto MASIVO: vive SOLO en esta tabla (una sola
  // página, sin context — a diferencia de /admin/expenses).
  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(),
  );
  const [openMasivo, setOpenMasivo] = useState(false);

  const visibles = useMemo(
    () =>
      categoria === "TODAS"
        ? gastos
        : gastos.filter((g) => g.categoria === categoria),
    [gastos, categoria],
  );

  // Poda anti "selección fantasma": tras repartir (revalidate cambia rows) o
  // al cambiar el chip de categoría, quedarían ids que ya no están en
  // pantalla. Se sincroniza con lo VISIBLE ahora (mismo patrón que
  // ExpensesSeleccionProvider).
  useEffect(() => {
    const ids = new Set(visibles.map((g) => g.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeleccionados((prev) => {
      let cambio = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else cambio = true;
      }
      return cambio ? next : prev;
    });
  }, [visibles]);

  const toggleSeleccion = useCallback((id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // El encabezado opera sobre TODOS los visibles del filtro de categoría (no
  // solo la página que muestre el DataTable).
  const todosVisibles =
    visibles.length > 0 && visibles.every((g) => seleccionados.has(g.id));
  const toggleTodosVisibles = useCallback(() => {
    setSeleccionados((prev) => {
      const todos =
        visibles.length > 0 && visibles.every((g) => prev.has(g.id));
      return todos ? new Set<string>() : new Set(visibles.map((g) => g.id));
    });
  }, [visibles]);

  const seleccionRows = useMemo(
    () => visibles.filter((g) => seleccionados.has(g.id)),
    [visibles, seleccionados],
  );

  // Totales de la selección POR MONEDA (jamás se mezclan MXN y USD).
  const totalesSeleccion = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of seleccionRows)
      m.set(g.moneda, (m.get(g.moneda) ?? 0) + Math.round(g.monto * 100));
    return [...m.entries()]
      .sort((a, b) => ordenMoneda(a[0]) - ordenMoneda(b[0]))
      .map(([moneda, cents]) => ({ moneda, total: cents / 100 }));
  }, [seleccionRows]);

  const limpiarSeleccion = useCallback(
    () => setSeleccionados(new Set()),
    [],
  );

  const abrirReparto = useCallback((g: OtroGastoRow) => {
    setRepartoGasto({
      id: g.id,
      categoria: g.categoria,
      monto: g.monto,
      moneda: g.moneda,
      fecha_gasto: g.fecha_gasto,
      descripcion: g.descripcion,
    });
    setOpenReparto(true);
  }, []);

  const columns = useMemo<Array<DataTableColumn<OtroGastoRow>>>(
    () => [
      {
        key: "sel",
        header: (
          <input
            type="checkbox"
            checked={todosVisibles}
            onChange={toggleTodosVisibles}
            className="h-4 w-4 accent-brand-600 align-middle"
            aria-label="Seleccionar todos los gastos visibles"
            title="Seleccionar todos los visibles"
          />
        ),
        headClassName: "w-8",
        cellClassName: "w-8",
        cell: (g) => (
          <input
            type="checkbox"
            checked={seleccionados.has(g.id)}
            onChange={() => toggleSeleccion(g.id)}
            className="h-4 w-4 accent-brand-600"
            aria-label="Seleccionar gasto para reparto masivo"
            title="Seleccionar para repartir en grupo"
          />
        ),
      },
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (g) => fmtDateOnly(g.fecha_gasto),
      },
      {
        key: "categoria",
        header: "Categoría",
        cell: (g) => (
          <Badge
            variant="outline"
            className={CATEGORIA_BADGE[g.categoria] ?? ""}
          >
            {categoriaGastoLabel(g.categoria)}
          </Badge>
        ),
      },
      {
        key: "descripcion",
        header: "Descripción",
        cell: (g) =>
          g.descripcion ? (
            <span
              className="block max-w-[240px] truncate text-xs text-muted-foreground"
              title={g.notas ?? g.descripcion}
            >
              {g.descripcion}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        cell: (g) => fmtMonto(g.monto, g.moneda),
      },
      {
        key: "pago",
        header: "Pago",
        cellClassName: "whitespace-nowrap",
        cell: (g) => (
          <span className="text-xs">
            {MEDIO_PAGO_LABELS[g.medio_pago] ?? g.medio_pago}
            {g.medio_pago === "TARJETA_CORP" && g.tarjeta_terminacion && (
              <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                **** {g.tarjeta_terminacion}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "asignacion",
        header: "Asignación",
        cell: (g) => {
          if (g.repartos.length > 0) {
            return (
              <div className="flex max-w-[300px] flex-wrap gap-1">
                {g.repartos.map((r) => (
                  // Cada parcial liga a la ficha del avión que lo absorbe.
                  <Link key={r.aeronave_id} href={`/admin/aircraft/${r.aeronave_id}`}>
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] transition-colors hover:border-brand-600/60 hover:text-brand-600"
                    >
                      {r.matricula ?? "¿?"} · {fmtMonto(r.monto, g.moneda)}
                    </Badge>
                  </Link>
                ))}
                {g.remanente > 0.004 && (
                  <Badge variant="secondary" className="text-[11px]">
                    VuelaTour · {fmtMonto(g.remanente, g.moneda)}
                  </Badge>
                )}
              </div>
            );
          }
          if (g.matricula) {
            // Sin reparto pero con avión clásico: cuenta 100% a ese avión.
            const badge = (
              <Badge
                variant="outline"
                className={
                  g.aeronave_id
                    ? "font-mono transition-colors hover:border-brand-600/60 hover:text-brand-600"
                    : "font-mono"
                }
              >
                Avión: {g.matricula}
              </Badge>
            );
            return g.aeronave_id ? (
              <Link href={`/admin/aircraft/${g.aeronave_id}`}>{badge}</Link>
            ) : (
              badge
            );
          }
          return <Badge variant="secondary">VuelaTour (sin asignar)</Badge>;
        },
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        cellClassName: "whitespace-nowrap",
        cell: (g) => (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            title="Repartir entre aviones"
            onClick={() => abrirReparto(g)}
          >
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Repartir
          </Button>
        ),
      },
    ],
    [abrirReparto, seleccionados, todosVisibles, toggleSeleccion, toggleTodosVisibles],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        {CATEGORIAS_FILTRO.map((c) => {
          const n =
            c === "TODAS"
              ? gastos.length
              : gastos.filter((g) => g.categoria === c).length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                categoria === c
                  ? "bg-brand-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "TODAS" ? "Todas" : categoriaGastoLabel(c)}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  categoria === c ? "bg-white/20" : "bg-background/60",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={visibles}
        rowKey={(g) => g.id}
        searchText={(g) =>
          [
            g.categoria,
            // El label mostrado también se indexa ("nómina" no es substring
            // de NOMINA).
            categoriaGastoLabel(g.categoria),
            g.descripcion ?? "",
            g.notas ?? "",
            g.matricula ?? "",
            g.repartos.map((r) => r.matricula ?? "").join(" "),
          ].join(" ")
        }
        searchPlaceholder="Buscar gasto (descripción, proveedor, categoría, matrícula)…"
      />

      {/* Barra flotante del reparto masivo: aparece con la primera casilla. */}
      {seleccionRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              {seleccionRows.length}
            </span>{" "}
            {seleccionRows.length === 1
              ? "gasto seleccionado"
              : "gastos seleccionados"}
          </p>
          {/* Totales POR MONEDA separados: MXN y USD jamás se suman. */}
          <p className="flex items-center gap-2">
            {totalesSeleccion.map((t) => (
              <span
                key={t.moneda}
                className="font-mono text-sm font-medium tabular-nums"
              >
                {fmtMonto(t.total, t.moneda)}
              </span>
            ))}
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setOpenMasivo(true)}
          >
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Repartir seleccionados
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={limpiarSeleccion}
            className="gap-1"
          >
            <XMarkIcon className="h-4 w-4" />
            Limpiar
          </Button>
        </div>
      )}

      <RepartoDialog
        open={openReparto}
        onOpenChange={setOpenReparto}
        gasto={repartoGasto}
      />

      <RepartoMasivoDialog
        open={openMasivo}
        onOpenChange={setOpenMasivo}
        gastos={seleccionRows.map((g) => ({
          id: g.id,
          monto: g.monto,
          moneda: g.moneda,
          fecha_gasto: g.fecha_gasto,
          descripcion: g.descripcion,
          tieneReparto: g.repartos.length > 0,
        }))}
        onSuccess={limpiarSeleccion}
      />
    </div>
  );
}
