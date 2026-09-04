"use client";

import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import type { InventarioMovimiento, TipoMovimiento } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

const TIPO_STYLE: Record<TipoMovimiento, { label: string; cls: string }> = {
  ENTRADA: { label: "Entrada", cls: "border-emerald-500/50 text-emerald-600" },
  SALIDA: { label: "Salida", cls: "border-brand-600/50 text-brand-600" },
  DEVOLUCION: { label: "Devolución", cls: "border-sky-500/50 text-sky-600" },
  AJUSTE: { label: "Ajuste", cls: "border-navy-400/50 text-muted-foreground" },
};

const columnasBase: Array<DataTableColumn<InventarioMovimiento>> = [
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "whitespace-nowrap",
    cell: (m) => fmtDateOnly(m.fecha_movimiento),
  },
  {
    key: "tipo",
    header: "Tipo",
    cell: (m) => {
      const style = TIPO_STYLE[m.tipo];
      return (
        <Badge variant="outline" className={style.cls}>
          {style.label}
        </Badge>
      );
    },
  },
  {
    key: "cantidad",
    header: "Cantidad",
    headClassName: "text-right",
    cellClassName: "text-right tabular-nums",
    cell: (m) => (
      <>
        {m.tipo === "SALIDA" ? "−" : "+"}
        {num(m.cantidad)}
      </>
    ),
  },
  {
    key: "costo",
    header: "Costo unit.",
    headClassName: "text-right",
    cellClassName: "text-right tabular-nums text-muted-foreground",
    cell: (m) =>
      // ENTRADA en $0 = la carga masiva quedó sin precio real: se marca en
      // ámbar para que se complete (el FIFO valoriza esa capa en $0 y la
      // salida no generaría gasto del avión).
      m.tipo === "ENTRADA" && !(Number(m.costo_unitario_usd) > 0) ? (
        <span className="font-medium text-amber-600 dark:text-amber-500">Sin costo</span>
      ) : (
        <>
          {/* Se muestra en pesos (moneda operativa) tal cual lo manda el API
              (costo_unitario_mxn_efectivo, criterio único costoUnitarioMxnDe):
              el panel ya NO convierte monedas. Respaldo por skew de deploy:
              los pesos capturados si los hay; si no, solo el USD interno. */}
          {m.costo_unitario_mxn_efectivo != null
            ? fmtMxn(m.costo_unitario_mxn_efectivo)
            : m.costo_unitario_mxn != null
              ? fmtMxn(m.costo_unitario_mxn)
              : `${fmtUsd(m.costo_unitario_usd)} USD`}
          <p className="text-[11px]">
            {fmtUsd(m.costo_unitario_usd)} USD
            {m.tc_usd_mxn ? ` · TC ${Number(m.tc_usd_mxn)}` : ""}
          </p>
        </>
      ),
  },
  {
    key: "origen",
    header: "Avión / Proveedor",
    cellClassName: "text-muted-foreground",
    // Salida prorrateada a toda la flota: no lleva avión, dice FLOTA.
    cell: (m) =>
      m.para_flota ? "FLOTA" : (m.aeronave?.matricula ?? m.proveedor?.nombre ?? "—"),
  },
  {
    key: "referencia",
    header: "Ref.",
    cellClassName: "text-muted-foreground font-mono text-xs",
    cell: (m) => m.referencia ?? "—",
  },
];

/** SALIDA con venta: el ítem tiene precio de venta y el avión pagó ESO. */
const conVentaDe = (m: InventarioMovimiento) =>
  m.tipo === "SALIDA" && m.venta_unitaria != null && Number(m.venta_unitaria) > 0;

/** Precio de venta unitario que pagó el avión (solo SALIDA con venta). */
const columnaVenta: DataTableColumn<InventarioMovimiento> = {
  key: "venta",
  header: "Venta unit.",
  headClassName: "text-right",
  cellClassName: "text-right tabular-nums",
  cell: (m) =>
    conVentaDe(m) ? (
      <>
        {m.venta_moneda === "USD"
          ? `${fmtUsd(m.venta_unitaria)} USD`
          : fmtMxn(m.venta_unitaria)}
      </>
    ) : (
      "—"
    ),
};

/** Ganancia (venta − costo FIFO, en MXN): la manda el API en el detalle. */
const columnaGanancia: DataTableColumn<InventarioMovimiento> = {
  key: "ganancia",
  header: "Ganancia",
  headClassName: "text-right",
  cellClassName: "text-right tabular-nums",
  cell: (m) =>
    conVentaDe(m) && m.ganancia_mxn != null ? (
      <span className={Number(m.ganancia_mxn) < 0 ? "text-red-600" : "text-emerald-600"}>
        {fmtMxn(m.ganancia_mxn)}
      </span>
    ) : (
      "—"
    ),
};

/** "2 × Caja de 6 = 12": cómo se capturó el movimiento (la cantidad sigue en unidades). */
const columnaPresentacion: DataTableColumn<InventarioMovimiento> = {
  key: "presentacion",
  header: "Presentación",
  cellClassName: "text-muted-foreground whitespace-nowrap text-xs",
  cell: (m) =>
    m.empaque && m.cantidad_empaques != null
      ? `${num(Number(m.cantidad_empaques))} × ${m.empaque.nombre} = ${num(m.cantidad)}`
      : "—",
};

/** Columna de acciones: corregir el costo SOLO de las ENTRADAS (rol oficina). */
function columnaAcciones(
  onEditarCosto: (m: InventarioMovimiento) => void,
): DataTableColumn<InventarioMovimiento> {
  return {
    key: "acciones",
    header: "",
    noLink: true,
    cellClassName: "text-right",
    cell: (m) =>
      m.tipo === "ENTRADA" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => onEditarCosto(m)}
        >
          <PencilSquareIcon className="h-4 w-4" />
          Editar costo
        </Button>
      ) : null,
  };
}

export function CardexTable({
  movimientos,
  onEditarCosto,
}: {
  movimientos: InventarioMovimiento[];
  /** Si viene, aparece la acción "Editar costo" en las filas ENTRADA. */
  onEditarCosto?: (m: InventarioMovimiento) => void;
}) {
  // La columna solo aparece si algún movimiento se capturó por empaque
  // (caja): a los ítems sin cajas no les estorba.
  const conEmpaques = movimientos.some((m) => !!m.empaque && m.cantidad_empaques != null);
  // Venta/ganancia solo si alguna SALIDA llevó precio de venta: a los ítems
  // que se cargan a costo FIFO no les estorban dos columnas vacías.
  const conVenta = movimientos.some(conVentaDe);
  let columns = conEmpaques
    ? [
        ...columnasBase.slice(0, 3),
        columnaPresentacion,
        ...columnasBase.slice(3),
      ]
    : columnasBase;
  if (conVenta) {
    const idx = columns.findIndex((c) => c.key === "costo") + 1;
    columns = [...columns.slice(0, idx), columnaVenta, columnaGanancia, ...columns.slice(idx)];
  }
  if (onEditarCosto) columns = [...columns, columnaAcciones(onEditarCosto)];
  return (
    <DataTable
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.id}
      searchText={(m) =>
        [
          TIPO_STYLE[m.tipo].label,
          m.para_flota ? "FLOTA" : undefined,
          m.aeronave?.matricula,
          m.proveedor?.nombre,
          m.referencia,
          m.empaque?.nombre,
          fmtDateOnly(m.fecha_movimiento),
        ]
          .filter(Boolean)
          .join(" ")
      }
      searchPlaceholder="Buscar movimiento (tipo, matrícula, proveedor, ref.)…"
    />
  );
}
