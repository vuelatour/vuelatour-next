"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableOrden,
} from "@/components/admin/data-table";
import { ItemActions } from "@/components/admin/inventory/item-actions";
import { fmtMxn } from "@/lib/format";
import {
  ATAJOS_ORDEN_INVENTARIO,
  ORDEN_INVENTARIO_DEFAULT,
  direccionDeColumna,
  ordenAlPulsarColumna,
  ordenInventarioDeUrl,
  ordenarInventario,
  resolverOrdenInventario,
  type ColumnaInventario,
  type EleccionOrden,
  type OrdenInventario,
} from "@/lib/admin/inventario-orden";
import type { InventarioItemWithStock } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

interface ItemsTableProps {
  items: InventarioItemWithStock[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  categorias: string[];
  /**
   * `?orden=` ya validado por la página (server). Solo RESPALDO cuando no hay
   * router (tests): en el panel manda la URL viva (`useSearchParams`).
   */
  ordenInicial?: OrdenInventario;
}

/** Key de columna de la tabla → columna del orden (la de producto ordena por nombre). */
const COLUMNA_DE_KEY: Record<string, ColumnaInventario> = {
  producto: "nombre",
  categoria: "categoria",
  stock: "stock",
  ganancia: "ganancia",
};

/**
 * Escribe `?orden=` SIN recargar ni ensuciar el historial (mismo mecanismo
 * que la búsqueda/página de DataTable). El default A–Z no se escribe: la URL
 * limpia es la de siempre. Conserva los demás parámetros (`tq`, `tp`…).
 */
function escribirOrdenEnUrl(orden: OrdenInventario) {
  const url = new URL(window.location.href);
  if (orden === ORDEN_INVENTARIO_DEFAULT) url.searchParams.delete("orden");
  else url.searchParams.set("orden", orden);
  window.history.replaceState(null, "", url.toString());
}

/**
 * Tabla principal de Inventario (pedido del cliente 4-sep-2026, réplica de
 * su Excel): Producto (item) · Categoría · Stock · Ganancia / pérdida. La
 * fila abre el detalle del producto (compras, ventas y resumen por día). La
 * ganancia la manda el API con la MISMA agregación de la hoja "inventario"
 * del Balance general (ventas con precio − costo FIFO de esas salidas): aquí
 * solo se pinta. Costo FIFO, mínimo y valorizado siguen en el detalle.
 *
 * Orden (24-sep-2026, pedido del cliente «ver primero las cosas que se van
 * acabando»): encabezados clicables ↑/↓ y atajos «A–Z · Se están acabando
 * primero · Más stock». Se ordena la bodega COMPLETA (la página ya la carga
 * entera) antes de la búsqueda y del paginado; la lógica vive en
 * `lib/admin/inventario-orden.ts` y el valor viaja en `?orden=`.
 */
export function ItemsTable({
  items,
  aircraft,
  providers,
  categorias,
  ordenInicial = ORDEN_INVENTARIO_DEFAULT,
}: ItemsTableProps) {
  // La URL VIVA manda (revisión 24-sep-2026). Al volver del detalle con
  // «Inventario» (BackLink = router.back()) Next REUSA el payload ya pintado
  // de esta página: su `ordenInicial` es el de la PRIMERA carga, no el que el
  // operador eligió después con clics (solo se escribió con replaceState).
  // Con un `useState(ordenInicial)` la URL decía `?orden=se-acaban` y la
  // tabla salía A–Z. `useSearchParams` sí sigue la URL real (Next integra
  // replaceState, atrás/adelante y enlaces).
  const sp = useSearchParams();
  const ordenUrl = sp ? ordenInventarioDeUrl(sp.get("orden")) : ordenInicial;
  // Clic = respuesta INMEDIATA: la elección local gana mientras la URL siga
  // en el valor sobre el que se tomó; en cuanto la URL cambia (el propio
  // replaceState ya asentado, atrás/adelante, menú lateral) manda la URL y la
  // elección caduca (ver `resolverOrdenInventario`, con test). Ajuste de
  // estado en render (patrón de React para derivar de un valor que cambió),
  // sin efecto ni parpadeo.
  const [eleccion, setEleccion] = useState<EleccionOrden | null>(null);
  const resuelto = resolverOrdenInventario(eleccion, ordenUrl);
  if (resuelto.eleccion !== eleccion) setEleccion(resuelto.eleccion);
  const orden = resuelto.orden;
  const ordenados = useMemo(() => ordenarInventario(items, orden), [items, orden]);

  const cambiarOrden = (nuevo: OrdenInventario) => {
    setEleccion({ base: ordenUrl, valor: nuevo });
    escribirOrdenEnUrl(nuevo);
  };

  const ordenTabla: DataTableOrden = {
    direccion: (key) => {
      const col = COLUMNA_DE_KEY[key];
      return col ? direccionDeColumna(col, orden) : null;
    },
    alPulsarColumna: (key) => {
      const col = COLUMNA_DE_KEY[key];
      if (col) cambiarOrden(ordenAlPulsarColumna(col, orden));
    },
    atajos: ATAJOS_ORDEN_INVENTARIO,
    atajoActivo: orden,
    alElegirAtajo: (valor) => cambiarOrden(ordenInventarioDeUrl(valor)),
  };

  const columns: Array<DataTableColumn<InventarioItemWithStock>> = [
    {
      key: "producto",
      header: "Producto (item)",
      ordenable: true,
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
      ordenable: true,
      cellClassName: "text-muted-foreground",
      cell: (it) => it.categoria,
    },
    {
      key: "stock",
      header: "Stock",
      ordenable: true,
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
      ordenable: true,
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
      rows={ordenados}
      orden={ordenTabla}
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
