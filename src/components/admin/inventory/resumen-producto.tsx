import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import type { InventarioItemResumen } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

/** Color de una utilidad: verde si ganó, rojo si perdió, neutro en 0 / sin dato. */
function utilidadClass(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-emerald-700 dark:text-emerald-400";
  if (v < 0) return "text-red-600";
  return "text-foreground";
}

/** Utilidad con signo explícito ("+$400.00 MXN"); "—" sin dato. */
function fmtUtilidad(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${fmtMxn(v)}`;
}

/**
 * Bloques COMPRAS | VENTAS | RESUMEN del detalle del producto (pedido del
 * cliente 4-sep-2026, réplica de su Excel: encabezados agrupados, Utilidad /
 * Pérdida resaltada). TODO viene calculado del API (GET items/:id/resumen —
 * el mismo FIFO y la misma ganancia de la hoja Inventario del Balance
 * general y del cardex Excel); aquí SOLO se pinta. Las fechas son días
 * Cancún (columna `date` del cardex): se pintan sin desplazar el día.
 */
export function ResumenProducto({ resumen }: { resumen: InventarioItemResumen | null }) {
  if (!resumen) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        No se pudo cargar el resumen de compras, ventas y utilidad de este producto. Recarga la
        página; el cardex completo sigue abajo.
      </div>
    );
  }
  const { item, compras, ventas, resumen_diario, totales } = resumen;
  const unidad = item.unidad ? ` ${item.unidad}` : "";
  const salidasACosto = ventas.filter((v) => v.a_costo).length;

  return (
    <section className="space-y-3">
      {totales.con_entradas_sin_costo && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          Hay compras sin costo ($0): la utilidad se ve inflada hasta que se complete el costo
          real de esas entradas (botón &ldquo;Editar costo&rdquo; en el cardex de abajo).
        </div>
      )}
      {totales.con_movimientos_sin_tc && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          Hay movimientos capturados en dólares sin tipo de cambio (marcados &ldquo;sin
          TC&rdquo;): sus montos en pesos y la utilidad de lo que salió de ellos no se pueden
          calcular y quedan fuera de los totales. Corrige el costo de esa entrada con su TC
          (botón &ldquo;Editar costo&rdquo; en el cardex de abajo).
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ===================== COMPRAS ===================== */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  colSpan={4}
                  className="h-9 bg-sky-500/10 text-center text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300"
                >
                  Compras
                </TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Fecha de compra</TableHead>
                <TableHead className="text-xs">Producto (item)</TableHead>
                <TableHead className="text-right text-xs">Cantidad</TableHead>
                <TableHead className="text-right text-xs">Precio compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground whitespace-normal"
                  >
                    Sin compras registradas. Registra una entrada para dar de alta stock.
                  </TableCell>
                </TableRow>
              ) : (
                compras.map((c, i) => (
                  <TableRow key={c.movimiento_id ?? `${c.fecha}-${i}`}>
                    <TableCell className="whitespace-nowrap">{fmtDateOnly(c.fecha)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{item.nombre}</span>
                      {c.tipo !== "ENTRADA" && (
                        <Badge
                          variant="outline"
                          className={
                            c.tipo === "DEVOLUCION"
                              ? "ml-1.5 border-sky-500/50 text-sky-600"
                              : "ml-1.5 border-navy-400/50 text-muted-foreground"
                          }
                        >
                          {c.tipo === "DEVOLUCION" ? "Devolución" : "Ajuste"}
                        </Badge>
                      )}
                      {(c.proveedor_nombre || c.aeronave_matricula || c.referencia || c.compra_id) && (
                        <span className="block text-xs text-muted-foreground">
                          {c.proveedor_nombre ?? c.aeronave_matricula ?? ""}
                          {(c.proveedor_nombre || c.aeronave_matricula) && c.referencia ? " · " : ""}
                          {c.referencia ? `ref ${c.referencia}` : ""}
                          {c.compra_id && (
                            <>
                              {c.proveedor_nombre || c.aeronave_matricula || c.referencia ? " · " : ""}
                              <Link
                                href={`/admin/inventory/compras/${c.compra_id}`}
                                className="underline underline-offset-2 hover:text-foreground"
                              >
                                Ver compra
                              </Link>
                            </>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(c.cantidad)}
                      {unidad}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.sin_costo ? (
                        <span className="font-medium text-amber-600 dark:text-amber-500">
                          Sin costo
                        </span>
                      ) : c.sin_tc ? (
                        <>
                          {fmtUsd(c.costo_unitario_capturado)} USD
                          <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-500">
                            sin TC · no se cuenta en pesos
                          </span>
                        </>
                      ) : (
                        <>
                          {fmtMxn(c.precio_unitario_mxn)}
                          <span className="block text-[11px] text-muted-foreground">
                            total {fmtMxn(c.total_mxn)}
                            {c.moneda_captura === "USD"
                              ? ` · ${fmtUsd(c.costo_unitario_capturado)} USD${
                                  c.tc_usd_mxn ? ` × TC ${c.tc_usd_mxn}` : ""
                                }`
                              : ""}
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="text-xs font-semibold">
                  Total compras
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">
                  {totales.compras_cant != null ? `${num(totales.compras_cant)}${unidad}` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">
                  {fmtMxn(totales.compras_mxn)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* ===================== VENTAS ===================== */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  colSpan={3}
                  className="h-9 bg-brand-600/10 text-center text-xs font-semibold uppercase tracking-wider text-brand-600"
                >
                  Ventas
                </TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Fecha de venta</TableHead>
                <TableHead className="text-right text-xs">Cantidad</TableHead>
                <TableHead className="text-right text-xs">Precio venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-sm text-muted-foreground whitespace-normal"
                  >
                    Sin ventas todavía. Se registran al dar salida a un avión.
                  </TableCell>
                </TableRow>
              ) : (
                ventas.map((v, i) => (
                  <TableRow key={v.movimiento_id ?? `${v.fecha}-${i}`}>
                    <TableCell className="whitespace-nowrap">{fmtDateOnly(v.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(v.cantidad)}
                      {unidad}
                      <span className="block text-[11px] text-muted-foreground">
                        {v.vendido_a === "FLOTA" ? "toda la flota" : `avión ${v.vendido_a}`}
                        {v.referencia ? ` · ref ${v.referencia}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.a_costo ? (
                        <>
                          <span className="text-muted-foreground">A costo FIFO</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {v.sin_tc ? (
                              <span className="font-medium text-amber-600 dark:text-amber-500">
                                sin TC · costo no expresable en pesos
                              </span>
                            ) : (
                              `${fmtMxn(v.total_mxn)} · sin utilidad`
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          {v.precio_unitario_mxn != null
                            ? fmtMxn(v.precio_unitario_mxn)
                            : `${fmtUsd(v.venta_unitaria_capturada)} USD`}
                          <span className="block text-[11px] text-muted-foreground">
                            {v.total_mxn != null ? `total ${fmtMxn(v.total_mxn)}` : ""}
                            {v.venta_moneda === "USD" && v.precio_unitario_mxn != null
                              ? ` · ${fmtUsd(v.venta_unitaria_capturada)} USD`
                              : ""}
                            {v.sin_tc ? (
                              <span className="font-medium text-amber-600 dark:text-amber-500">
                                {v.total_mxn != null ? " · " : ""}sin TC · utilidad no calculable
                              </span>
                            ) : (
                              <>
                                {" · "}
                                <span className={utilidadClass(v.ganancia_mxn)}>
                                  utilidad {fmtUtilidad(v.ganancia_mxn)}
                                </span>
                              </>
                            )}
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-xs font-semibold whitespace-normal">
                  Total ventas
                  {salidasACosto > 0 && (
                    <span className="block font-normal text-muted-foreground">
                      + {fmtMxn(totales.ventas_a_costo_mxn)} a costo FIFO (
                      {salidasACosto === 1 ? "1 salida" : `${salidasACosto} salidas`})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums align-top">
                  {totales.ventas_cant != null ? `${num(totales.ventas_cant)}${unidad}` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums align-top">
                  {fmtMxn(totales.ventas_mxn)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* ===================== RESUMEN ===================== */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  colSpan={3}
                  className="h-9 bg-emerald-500/10 text-center text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                >
                  Resumen
                </TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Fecha del día</TableHead>
                <TableHead className="text-right text-xs">Cantidad existente</TableHead>
                <TableHead className="bg-emerald-500/10 text-right text-xs text-emerald-700 dark:text-emerald-300">
                  Utilidad / Pérdida
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen_diario.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-sm text-muted-foreground whitespace-normal"
                  >
                    Sin movimientos todavía.
                  </TableCell>
                </TableRow>
              ) : (
                resumen_diario.map((d) => (
                  <TableRow key={d.fecha}>
                    <TableCell className="whitespace-nowrap">{fmtDateOnly(d.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(d.existencia_cierre)}
                      {unidad}
                      <span className="block text-[11px] text-muted-foreground">
                        {d.entradas_cant > 0 ? `entró ${num(d.entradas_cant)}` : ""}
                        {d.entradas_cant > 0 && d.salidas_cant > 0 ? " · " : ""}
                        {d.salidas_cant > 0 ? `salió ${num(d.salidas_cant)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        d.utilidad_mxn != null && d.utilidad_mxn < 0
                          ? "bg-red-500/10"
                          : "bg-emerald-500/10"
                      } ${utilidadClass(d.utilidad_mxn)}`}
                      title={d.sin_tc ? "Ese día hay movimientos en USD sin TC" : undefined}
                    >
                      {fmtUtilidad(d.utilidad_mxn)}
                      {d.sin_tc && (
                        <ExclamationTriangleIcon className="ml-1 inline h-3.5 w-3.5 text-amber-500" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-xs font-semibold">Hoy</TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">
                  {num(totales.existencia_actual)}
                  {unidad}
                </TableCell>
                <TableCell
                  className={`text-right text-xs font-semibold tabular-nums ${
                    totales.utilidad_mxn != null && totales.utilidad_mxn < 0
                      ? "bg-red-500/10"
                      : "bg-emerald-500/10"
                  } ${utilidadClass(totales.utilidad_mxn)}`}
                >
                  {fmtUtilidad(totales.utilidad_mxn)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Montos en pesos. Utilidad = precio de venta al avión − costo FIFO de lo que salió; las
        salidas sin precio (a costo FIFO) no generan utilidad. Es el mismo cálculo de la hoja
        Inventario del Balance general VuelaTour y del cardex en Excel.
      </p>
    </section>
  );
}
