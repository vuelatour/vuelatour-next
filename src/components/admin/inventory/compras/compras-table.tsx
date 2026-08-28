"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMontoMoneda, toNum, type CompraListItem } from "@/types/compras";
import { CompraEstadoBadge } from "./compra-badges";

export function ComprasTable({ compras }: { compras: CompraListItem[] }) {
  const columns: Array<DataTableColumn<CompraListItem>> = [
    {
      key: "folio",
      header: "Folio",
      cellClassName: "font-mono whitespace-nowrap",
      cell: (c) => `#${c.folio}`,
    },
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "whitespace-nowrap",
      cell: (c) => fmtDateOnly(c.fecha),
    },
    {
      key: "proveedor",
      header: "Proveedor",
      cell: (c) =>
        c.proveedor?.nombre ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "referencia",
      header: "Referencia",
      cellClassName: "text-muted-foreground",
      cell: (c) => c.referencia ?? "—",
    },
    {
      key: "estado",
      header: "Estado",
      cell: (c) => <CompraEstadoBadge estado={c.estado} />,
    },
    {
      key: "lineas",
      header: "Líneas",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (c) => c.n_lineas,
    },
    {
      key: "pagos",
      header: "Pagos",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (c) => c.n_pagos,
    },
    {
      key: "mercancia",
      header: "Mercancía",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap",
      cell: (c) => fmtMontoMoneda(c.total_mercancia, c.moneda),
    },
    {
      // Costo puesto en bodega = mercancía + envío + impuestos + otros.
      key: "total",
      header: "Puesto en bodega",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap",
      cell: (c) => (
        <>
          <span className="font-medium">{fmtMontoMoneda(c.total, c.moneda)}</span>
          {c.moneda === "USD" && c.total_mxn != null && toNum(c.total_mxn) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              ≈ {fmtMontoMoneda(c.total_mxn, "MXN")}
            </p>
          )}
          {c.moneda === "MXN" && c.total_usd != null && toNum(c.total_usd) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              ≈ {fmtMontoMoneda(c.total_usd, "USD")}
            </p>
          )}
        </>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={compras}
      rowKey={(c) => c.id}
      rowHref={(c) => `/admin/inventory/compras/${c.id}`}
      searchText={(c) =>
        [`#${c.folio}`, c.proveedor?.nombre ?? "", c.referencia ?? "", c.estado].join(" ")
      }
      searchPlaceholder="Buscar compra (folio, proveedor, referencia)…"
    />
  );
}
