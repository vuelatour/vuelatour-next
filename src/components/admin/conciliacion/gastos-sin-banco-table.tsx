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
}

const COLUMNS: DataTableColumn<GastoSinBancoRow>[] = [
  { key: "fecha", header: "Fecha", cell: (r) => fmtDateOnly(r.fecha) },
  { key: "descripcion", header: "Gasto", cell: (r) => r.descripcion },
  { key: "medio", header: "Medio", cell: (r) => r.medio },
  { key: "capturo", header: "Capturó", cell: (r) => r.capturo },
  { key: "vuelo", header: "Vuelo", cell: (r) => r.vuelo },
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
        `${r.descripcion} ${r.medio} ${r.capturo} ${r.vuelo} ${r.monto}`
      }
      searchPlaceholder="Buscar gasto (categoría, proveedor, monto)…"
      syncId="gsb"
    />
  );
}
