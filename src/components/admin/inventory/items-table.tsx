"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ItemActions } from "@/components/admin/inventory/item-actions";
import type { InventarioItemWithStock } from "@/types/inventory";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

interface ItemsTableProps {
  items: InventarioItemWithStock[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  categorias: string[];
}

export function ItemsTable({ items, aircraft, providers, categorias }: ItemsTableProps) {
  const columns: Array<DataTableColumn<InventarioItemWithStock>> = [
    {
      key: "item",
      header: "Ítem",
      cell: (it) => (
        <div className="flex items-center gap-2.5">
          {it.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.foto_url}
              alt={it.nombre}
              className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border"
            />
          )}
          <div className="min-w-0">
            <Link
              href={`/admin/inventory/${it.id}`}
              className="font-medium hover:text-brand-600 hover:underline"
            >
              {it.nombre}
            </Link>
            {(it.numero_parte || it.codigo) && (
              <span className="block text-xs text-muted-foreground font-mono">
                {[it.numero_parte, it.codigo].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "categoria",
      header: "Categoría",
      cellClassName: "text-muted-foreground",
      cell: (it) => it.categoria,
    },
    {
      key: "stock",
      header: "Stock",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (it) => (
        <span className="inline-flex items-center gap-1.5">
          {num(it.stock)}
          {it.unidad && (
            <span className="ml-1 text-xs text-muted-foreground">{it.unidad}</span>
          )}
          {it.bajo_stock && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Bajo
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "minimo",
      header: "Mínimo",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums text-muted-foreground",
      cell: (it) => (it.stock_minimo != null ? num(it.stock_minimo) : "—"),
    },
    {
      key: "costo_fifo",
      header: "Costo FIFO",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums text-muted-foreground",
      cell: (it) =>
        it.costo_fifo_mxn_actual ? `${mxn(it.costo_fifo_mxn_actual)} MXN` : "—",
    },
    {
      key: "valor",
      header: "Valor",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (it) => `${mxn(it.valor_mxn)} MXN`,
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      noLink: true,
      cell: (it) => (
        <ItemActions
          item={it}
          aircraft={aircraft}
          providers={providers}
          categorias={categorias}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(it) => it.id}
      searchText={(it) =>
        [it.nombre, it.numero_parte, it.codigo, it.categoria, it.ubicacion]
          .filter(Boolean)
          .join(" ")
      }
      searchPlaceholder="Buscar ítem (nombre, parte, SKU, ubicación)…"
    />
  );
}
