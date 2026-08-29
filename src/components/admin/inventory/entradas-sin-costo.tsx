"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";
import {
  EditarCostoDialog,
  type MovimientoCostoEditable,
} from "./editar-costo-dialog";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

/** Fila serializable de una ENTRADA sin costo (la arma la página server). */
export interface EntradaSinCosto {
  id: string;
  itemId: string;
  itemNombre: string;
  fecha_movimiento: string;
  cantidad: number;
  referencia: string | null;
  moneda?: "MXN" | "USD";
  costo_unitario_usd: number;
  costo_unitario_mxn?: number | null;
  tc_usd_mxn?: number | null;
}

interface EntradasSinCostoProps {
  entradas: EntradaSinCosto[];
  /** ADMIN/MECANICO: habilita "Completar costo" (los demás solo lo ven). */
  puedeEditarCosto: boolean;
}

/**
 * Banner ámbar + sección colapsable con las ENTRADAS de bodega sin costo
 * (la carga masiva las dejó en $0 y el cliente las completa con el precio
 * real). Mientras estén en $0, esas capas valorizan en $0 y una salida no
 * genera el gasto del avión — por eso se persigue desde la portada de
 * Inventario, no solo en el cardex de cada ítem.
 */
export function EntradasSinCosto({ entradas, puedeEditarCosto }: EntradasSinCostoProps) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<MovimientoCostoEditable | null>(null);

  if (entradas.length === 0) return null;

  const columns: Array<DataTableColumn<EntradaSinCosto>> = [
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "whitespace-nowrap",
      cell: (e) => fmtDateOnly(e.fecha_movimiento),
    },
    {
      key: "item",
      header: "Ítem",
      cell: (e) => (
        <Link
          href={`/admin/inventory/${e.itemId}`}
          className="font-medium hover:underline"
        >
          {e.itemNombre}
        </Link>
      ),
    },
    {
      key: "cantidad",
      header: "Cantidad",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (e) => num(e.cantidad),
    },
    {
      key: "referencia",
      header: "Ref.",
      cellClassName: "text-muted-foreground font-mono text-xs",
      cell: (e) => e.referencia ?? "—",
    },
  ];
  if (puedeEditarCosto) {
    columns.push({
      key: "acciones",
      header: "",
      noLink: true,
      cellClassName: "text-right",
      cell: (e) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            setEditando({
              id: e.id,
              itemId: e.itemId,
              itemNombre: e.itemNombre,
              fecha_movimiento: e.fecha_movimiento,
              cantidad: e.cantidad,
              referencia: e.referencia,
              moneda: e.moneda,
              costo_unitario_usd: e.costo_unitario_usd,
              costo_unitario_mxn: e.costo_unitario_mxn,
              tc_usd_mxn: e.tc_usd_mxn,
            })
          }
        >
          <CurrencyDollarIcon className="h-4 w-4" />
          Completar costo
        </Button>
      ),
    });
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-amber-700 dark:text-amber-400"
      >
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1">
          {entradas.length}{" "}
          {entradas.length === 1
            ? "entrada de bodega sin costo por completar"
            : "entradas de bodega sin costo por completar"}
          . Mientras estén en $0, esas piezas valorizan en cero y su salida no genera el
          gasto del avión.
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div className="border-t border-amber-500/30 bg-background/60">
          <DataTable
            columns={columns}
            rows={entradas}
            rowKey={(e) => e.id}
            searchText={(e) =>
              [e.itemNombre, e.referencia, fmtDateOnly(e.fecha_movimiento)]
                .filter(Boolean)
                .join(" ")
            }
            searchPlaceholder="Buscar entrada (ítem, referencia, fecha)…"
            syncId="sincosto"
          />
        </div>
      )}

      <EditarCostoDialog
        open={editando != null}
        onOpenChange={(o) => {
          if (!o) setEditando(null);
        }}
        movimiento={editando}
      />
    </div>
  );
}
