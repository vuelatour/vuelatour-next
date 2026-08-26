"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MEDIO_PAGO_LABELS } from "@/components/admin/expenses/expenses-table";
import {
  RepartoDialog,
  type RepartoGasto,
} from "@/components/admin/expenses/reparto-dialog";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
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
  /** Matrícula del avión clásico (aeronave_id del gasto), si tiene. */
  matricula: string | null;
  /** Reparto entre aviones (tabla hija); vacío = sin reparto. */
  repartos: Array<{ aeronave_id: string; matricula: string | null; monto: number }>;
  /** monto − Σ repartos: la parte de VuelaTour cuando HAY reparto. */
  remanente: number;
}

const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

const CATEGORIA_BADGE: Record<string, string> = {
  OTRO: "border-border text-foreground",
  FIJO: "border-sky-500/50 text-sky-600",
  INDIRECTO: "border-violet-500/50 text-violet-600",
};

const CATEGORIAS_FILTRO = ["TODAS", "OTRO", "FIJO", "INDIRECTO"] as const;
type CategoriaFiltro = (typeof CATEGORIAS_FILTRO)[number];

/**
 * Tabla de Otros gastos con filtro de categoría (client-side: el mes ya
 * viene acotado del server) y el diálogo de reparto compartido por fila.
 */
export function OtrosGastosTable({ gastos }: { gastos: OtroGastoRow[] }) {
  const [categoria, setCategoria] = useState<CategoriaFiltro>("TODAS");
  const [repartoGasto, setRepartoGasto] = useState<RepartoGasto | null>(null);
  const [openReparto, setOpenReparto] = useState(false);

  const visibles = useMemo(
    () =>
      categoria === "TODAS"
        ? gastos
        : gastos.filter((g) => g.categoria === categoria),
    [gastos, categoria],
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
            {g.categoria}
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
                  <Badge
                    key={r.aeronave_id}
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    {r.matricula ?? "¿?"} · {fmtMonto(r.monto, g.moneda)}
                  </Badge>
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
            return (
              <Badge variant="outline" className="font-mono">
                Avión: {g.matricula}
              </Badge>
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
    [abrirReparto],
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
              {c === "TODAS" ? "Todas" : c}
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
            g.descripcion ?? "",
            g.notas ?? "",
            g.matricula ?? "",
            g.repartos.map((r) => r.matricula ?? "").join(" "),
          ].join(" ")
        }
        searchPlaceholder="Buscar gasto (descripción, proveedor, categoría, matrícula)…"
      />

      <RepartoDialog
        open={openReparto}
        onOpenChange={setOpenReparto}
        gasto={repartoGasto}
      />
    </div>
  );
}
