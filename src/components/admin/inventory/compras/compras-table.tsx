"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";
import { gastoDe, puedeEliminarDesdeLista, recepcionDe } from "@/lib/admin/compras-estado";
import { fmtMontoMoneda, toNum, type CompraListItem } from "@/types/compras";
import { GastoCompraBadge, RecepcionBadge, SinLineasBadge } from "./compra-badges";
import { CompraEliminarDialog } from "./compra-eliminar-dialog";

/**
 * La lista de compras dice QUÉ LE FALTA a cada una (21-oct-2026): recepción
 * en bodega y gasto, con los estados que manda el API. Una compra sin líneas
 * se marca y, si sigue abierta, se puede eliminar aquí mismo.
 */
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
      cell: (c) => (
        <>
          {c.proveedor?.nombre ?? <span className="text-muted-foreground">—</span>}
          {c.referencia && <p className="text-[11px] text-muted-foreground">Ref. {c.referencia}</p>}
        </>
      ),
    },
    {
      key: "recepcion",
      header: "Recepción",
      cell: (c) => <RecepcionBadge compra={c} />,
    },
    {
      key: "gasto",
      header: "Gasto",
      cell: (c) => <GastoCompraBadge compra={c} />,
    },
    {
      key: "lineas",
      header: "Líneas",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (c) => (c.n_lineas === 0 ? <SinLineasBadge /> : c.n_lineas),
    },
    {
      // Líneas + cargos impresos en la factura = el monto de su gasto.
      key: "factura",
      header: <span title="Líneas + cargos impresos en la factura: el monto de su gasto">Factura</span>,
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap",
      cell: (c) => fmtMontoMoneda(c.total_factura ?? c.total_mercancia, c.moneda),
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
            <p className="text-[10px] text-muted-foreground">≈ {fmtMontoMoneda(c.total_mxn, "MXN")}</p>
          )}
          {c.moneda === "MXN" && c.total_usd != null && toNum(c.total_usd) > 0 && (
            <p className="text-[10px] text-muted-foreground">≈ {fmtMontoMoneda(c.total_usd, "USD")}</p>
          )}
        </>
      ),
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      noLink: true,
      cell: (c) => (puedeEliminarDesdeLista(c) ? <CompraEliminarDialog compra={c} /> : null),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={compras}
      rowKey={(c) => c.id}
      rowHref={(c) => `/admin/inventory/compras/${c.id}`}
      searchText={(c) =>
        [
          `#${c.folio}`,
          c.proveedor?.nombre ?? "",
          c.referencia ?? "",
          recepcionDe(c).etiqueta,
          gastoDe(c).etiqueta,
        ].join(" ")
      }
      searchPlaceholder="Buscar compra (folio, proveedor, referencia, estado)…"
    />
  );
}
