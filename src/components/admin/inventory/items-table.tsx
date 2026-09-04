"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ItemActions } from "@/components/admin/inventory/item-actions";
import { fmtMxn } from "@/lib/format";
import type { InventarioItemWithStock } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

interface ItemsTableProps {
  items: InventarioItemWithStock[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  categorias: string[];
}

/**
 * Tabla principal de Inventario (pedido del cliente 4-sep-2026, réplica de
 * su Excel): Producto (item) · Categoría · Stock · Ganancia / pérdida. La
 * fila abre el detalle del producto (compras, ventas y resumen por día). La
 * ganancia la manda el API con la MISMA agregación de la hoja "inventario"
 * del Balance general (ventas con precio − costo FIFO de esas salidas): aquí
 * solo se pinta. Costo FIFO, mínimo y valorizado siguen en el detalle.
 */
export function ItemsTable({ items, aircraft, providers, categorias }: ItemsTableProps) {
  const columns: Array<DataTableColumn<InventarioItemWithStock>> = [
    {
      key: "producto",
      header: "Producto (item)",
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
            <span className="font-medium">{it.nombre}</span>
            {(it.marca || it.numero_parte || it.codigo) && (
              <span className="block text-xs text-muted-foreground">
                {it.marca && <span>{it.marca}</span>}
                {it.marca && (it.numero_parte || it.codigo) && " · "}
                {(it.numero_parte || it.codigo) && (
                  <span className="font-mono">
                    {[it.numero_parte, it.codigo].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            )}
            {(it.empaques ?? []).some((e) => e.activo) && (
              <span className="block text-[11px] text-muted-foreground">
                {(it.empaques ?? [])
                  .filter((e) => e.activo)
                  .map((e) => `${e.nombre} (${e.factor})`)
                  .join(" · ")}
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
      key: "ganancia",
      header: "Ganancia / pérdida",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (it) => <GananciaCell item={it} />,
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
      rowHref={(it) => `/admin/inventory/${it.id}`}
      searchText={(it) =>
        [
          it.nombre,
          it.marca,
          it.numero_parte,
          it.codigo,
          it.categoria,
          it.ubicacion,
          ...(it.empaques ?? []).flatMap((e) => [e.nombre, e.codigo]),
        ]
          .filter(Boolean)
          .join(" ")
      }
      searchPlaceholder="Buscar producto (nombre, marca, parte, código, categoría)…"
    />
  );
}

/** Aviso ámbar: por qué la cifra no es de fiar (entradas a $0 / USD sin TC). */
function avisoDe(item: InventarioItemWithStock): string | null {
  const partes: string[] = [];
  if (item.con_entradas_sin_costo) partes.push("hay entradas sin costo: la ganancia está inflada");
  if (item.con_movimientos_sin_tc)
    partes.push("hay movimientos en USD sin tipo de cambio: sus pesos no se cuentan");
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Ganancia / pérdida acumulada del producto: verde si ganó, rojo si perdió,
 * "—" si nunca vendió con precio (las salidas a costo FIFO no son venta).
 * El triángulo ámbar avisa que la cifra no es de fiar: hay entradas a $0
 * (inflada hasta completar el costo real) o movimientos en USD sin tipo de
 * cambio (el API no los suma como pesos).
 */
function GananciaCell({ item }: { item: InventarioItemWithStock }) {
  const g = item.ganancia_mxn;
  const aviso = avisoDe(item);
  if (g == null) {
    return (
      <span
        className="inline-flex items-center justify-end gap-1.5 text-muted-foreground"
        title={aviso ?? "Sin ventas con precio registradas"}
      >
        —
        {aviso && <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />}
      </span>
    );
  }
  const cls =
    g > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : g < 0
        ? "text-red-600"
        : "text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center justify-end gap-1.5 font-medium ${cls}`}
      title={aviso ?? undefined}
    >
      {g > 0 ? "+" : ""}
      {fmtMxn(g)}
      {aviso && (
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" aria-label={aviso} />
      )}
    </span>
  );
}
