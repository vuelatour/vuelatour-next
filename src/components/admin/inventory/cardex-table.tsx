"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly } from "@/lib/datetime";
import type { InventarioMovimiento, TipoMovimiento } from "@/types/inventory";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
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
    cell: (m) => (
      <>
        {/* Se muestra en pesos (moneda operativa); el USD interno alimenta
            el reparto y va como referencia. Prioridad: los pesos REALES del
            movimiento si existen (sea cual sea la moneda — una SALIDA hereda
            los pesos exactos de su ENTRADA, sin re-redondear USD×TC), luego
            USD×TC, y USD tal cual como último recurso. */}
        {m.costo_unitario_mxn != null
          ? `${mxn(Number(m.costo_unitario_mxn))} MXN`
          : m.tc_usd_mxn
            ? `${mxn(Number(m.costo_unitario_usd) * Number(m.tc_usd_mxn))} MXN`
            : `${mxn(m.costo_unitario_usd)} MXN`}
        <p className="text-[11px]">
          {usd(m.costo_unitario_usd)} USD
          {m.tc_usd_mxn ? ` · TC ${Number(m.tc_usd_mxn)}` : ""}
        </p>
      </>
    ),
  },
  {
    key: "origen",
    header: "Avión / Proveedor",
    cellClassName: "text-muted-foreground",
    cell: (m) => m.aeronave?.matricula ?? m.proveedor?.nombre ?? "—",
  },
  {
    key: "referencia",
    header: "Ref.",
    cellClassName: "text-muted-foreground font-mono text-xs",
    cell: (m) => m.referencia ?? "—",
  },
];

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

export function CardexTable({ movimientos }: { movimientos: InventarioMovimiento[] }) {
  // La columna solo aparece si algún movimiento se capturó por empaque
  // (caja): a los ítems sin cajas no les estorba.
  const conEmpaques = movimientos.some((m) => !!m.empaque && m.cantidad_empaques != null);
  const columns = conEmpaques
    ? [
        ...columnasBase.slice(0, 3),
        columnaPresentacion,
        ...columnasBase.slice(3),
      ]
    : columnasBase;
  return (
    <DataTable
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.id}
      searchText={(m) =>
        [
          TIPO_STYLE[m.tipo].label,
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
