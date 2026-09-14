"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";

/** Fila serializable que arma la página (server). */
export interface GastoSinBancoRow {
  id: string;
  fecha: string;
  descripcion: string;
  medio: string;
  capturo: string;
  vuelo: string;
  monto: string;
  /** PAGO PARCIAL (14-sep-2026): «faltan $X» cuando el gasto ya tiene cargos
   *  del banco ligados que todavía no lo cubren. null = sin ligar (o API sin
   *  desplegar: la columna queda en «—», como antes). */
  parcial?: string | null;
}

const COLUMNS: DataTableColumn<GastoSinBancoRow>[] = [
  { key: "fecha", header: "Fecha", cell: (r) => fmtDateOnly(r.fecha) },
  { key: "descripcion", header: "Gasto", cell: (r) => r.descripcion },
  { key: "medio", header: "Medio", cell: (r) => r.medio },
  { key: "capturo", header: "Capturó", cell: (r) => r.capturo },
  { key: "vuelo", header: "Vuelo", cell: (r) => r.vuelo },
  {
    key: "parcial",
    header: "Parcial",
    cell: (r) =>
      r.parcial ? (
        <span
          className="text-amber-600 dark:text-amber-400 whitespace-nowrap"
          title="Ya tiene cargos del banco ligados, pero no cubren el gasto (p. ej. una factura pagada en dos cargos)."
        >
          {r.parcial}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "monto",
    header: "Monto",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (r) => <span className="font-mono tabular-nums">{r.monto}</span>,
  },
];

export function GastosSinBancoTable({ rows }: { rows: GastoSinBancoRow[] }) {
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      searchText={(r) =>
        `${r.descripcion} ${r.medio} ${r.capturo} ${r.vuelo} ${r.monto} ${r.parcial ?? ""}`
      }
      searchPlaceholder="Buscar gasto (categoría, proveedor, monto)…"
      syncId="gsb"
    />
  );
}
