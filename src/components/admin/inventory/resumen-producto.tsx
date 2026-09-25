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
import { fmtMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cantidadConUnidad } from "@/lib/admin/inventario-eliminar";
import {
  AVISO_COMPRAS_SIN_COSTO,
  BANDA_SIN_TC_API_PREVIO,
  CHIP_PRECIO_VIGENTE,
  ENLACE_ABRIR_CARDEX,
  ID_PLEGABLE_CARDEX,
  NOTA_FICHA_API_PREVIO,
  SIN_VENTAS,
  SUB_NO_CAMBIA_PRECIO,
  SUB_SIN_TC,
  TITULO_CHIP_PRECIO_VIGENTE,
  TITULO_DINERO,
  dineroGeneradoDeTotales,
  fmtPrecioUnitario,
  lineaUsdOriginal,
  notaFicha,
  piezasDineroGenerado,
  subTcCompra,
  textoBajoMinimo,
  textoBandaSinTc,
  textoCargadoACosto,
  textoDineroACosto,
  textoPrecioVigente,
  textoTc,
  textoUtilidadUsdSinTc,
  textoUtilidadVenta,
} from "@/lib/admin/inventario-ficha";
import {
  TEXTO_A_COSTO,
  avisoVentasSinUtilidad,
  numeroONulo,
  textoMonto,
  tonoDe,
} from "@/lib/admin/inventario-utilidad";
import type {
  InventarioItemResumen,
  MonedaInventario,
  ResumenCompra,
  ResumenVenta,
} from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

/** Verde si ganó, rojo si perdió, neutro en 0 / sin dato. */
function claseTono(v: number | null | undefined): string {
  const t = tonoDe(v);
  return t === "positivo"
    ? "text-emerald-700 dark:text-emerald-400"
    : t === "negativo"
      ? "text-red-600"
      : "text-muted-foreground";
}

const moneda = (m: string | null | undefined): MonedaInventario => (m === "USD" ? "USD" : "MXN");

/**
 * Utilidad de un día / del total: pesos y, SOLO si quedan filas sin T.C.
 * (respaldo), la parte en dólares en su propio renglón. Jamás sumadas.
 */
function Utilidad({ mxn, usd }: { mxn: number | null | undefined; usd: number | null | undefined }) {
  const m = numeroONulo(mxn);
  const u = numeroONulo(usd);
  if (m == null && u == null) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {m != null && <span className={cn("block", claseTono(m))}>{textoMonto(m, "MXN")}</span>}
      {u != null && (
        <span className={cn("block", claseTono(u))} title="Ventas en dólares sin tipo de cambio">
          {textoMonto(u, "USD")}
        </span>
      )}
    </>
  );
}

interface ResumenProductoProps {
  resumen: InventarioItemResumen | null;
  /** Del detalle del ítem: el pie del Resumen avisa «bajo el mínimo». */
  bajoStock?: boolean;
  stockMinimo?: number | null;
}

/**
 * FICHA SENCILLA del producto (pedido del cliente 25-sep-2026): SOLO los
 * bloques COMPRAS | VENTAS | RESUMEN y, debajo, «Dinero generado por este
 * producto».
 *
 *  - COMPRAS = a cuánto se ha comprado: precio unitario NATIVO (con su
 *    moneda y el T.C. oficial del día de la compra) y total en pesos. El
 *    último precio de compra lleva el chip «Precio vigente».
 *  - VENTAS = historial de a cuánto se ha vendido: avión, precio unitario
 *    nativo (T.C. del día de la VENTA) y total en pesos con su utilidad.
 *  - RESUMEN = existencia por día + utilidad/pérdida en pesos.
 *
 * TODO viene calculado del API (`GET items/:id/resumen`, fuente única
 * `inventario-cardex.util.ts`, la MISMA del Balance general y del cardex en
 * Excel); aquí SOLO se pinta — ningún costo, T.C., utilidad ni suma entre
 * monedas. Las fechas son días Cancún (columna `date`): se pintan sin
 * desplazar el día. Con un API PREVIO (sin `regla_costo`) se pinta igual,
 * sin romper y sin sumar monedas.
 */
export function ResumenProducto({ resumen, bajoStock, stockMinimo }: ResumenProductoProps) {
  if (!resumen) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        No se pudieron cargar las compras, ventas y utilidad de este producto. Recarga la
        página; el cardex completo sigue abajo.
      </div>
    );
  }
  const { item, compras, ventas, resumen_diario, totales } = resumen;
  const unidad = item.unidad;
  const conUnidad = (n: number) => cantidadConUnidad(n, unidad);
  const reglaNueva = !!resumen.regla_costo;
  const margen = resumen.margen_venta_pct;

  // Banda naranja SOLO si de verdad quedan movimientos sin T.C. Con un API
  // previo (sin el conteo), la bandera de siempre.
  const bandaSinTc =
    "movimientos_sin_tc" in totales
      ? textoBandaSinTc(totales.movimientos_sin_tc)
      : totales.con_movimientos_sin_tc
        ? BANDA_SIN_TC_API_PREVIO
        : null;

  const dinero = resumen.dinero_generado ?? dineroGeneradoDeTotales(totales);
  const precioVigente = textoPrecioVigente(resumen.precio_vigente, margen);
  const salidasACosto = ventas.filter((v) => v.a_costo).length;
  const cargadoACosto = textoCargadoACosto(totales.ventas_a_costo_mxn, {
    unidades: totales.salidas_a_costo_cant,
    salidas: salidasACosto,
    unidad,
  });
  const ventasUsdSinTc = numeroONulo(totales.ventas_usd);
  // «Total vendido» = unidades de las salidas CON precio (API 0.0.36,
  // `unidades_vendidas`), las MISMAS que suman `ventas_mxn`. OJO:
  // `ventas_cant` del bloque cuenta TODAS las salidas (también las a costo,
  // que ya van aparte en «cargados a costo»): junto a `ventas_mxn` diría
  // «66 qt vendidos por $16,263.61» cuando fueron 36. Con un API previo
  // (sin el campo), el número de siempre.
  const unidadesVendidas =
    "unidades_vendidas" in totales ? numeroONulo(totales.unidades_vendidas) : totales.ventas_cant;
  const bajoMinimo = textoBajoMinimo(bajoStock, stockMinimo);

  return (
    <section className="space-y-3">
      {totales.con_entradas_sin_costo && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            {AVISO_COMPRAS_SIN_COSTO}{" "}
            <a
              href={`#${ID_PLEGABLE_CARDEX}`}
              className="cursor-pointer font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
            >
              {ENLACE_ABRIR_CARDEX}
            </a>
          </span>
        </div>
      )}
      {bandaSinTc && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{bandaSinTc}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,0.9fr)]">
        {/* ===================== COMPRAS ===================== */}
        <div className="space-y-2">
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
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-right text-xs">Cantidad</TableHead>
                  <TableHead className="text-right text-xs">Precio unitario</TableHead>
                  <TableHead className="text-right text-xs">Total MXN</TableHead>
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
                    <FilaCompra
                      key={c.movimiento_id ?? `${c.fecha}-${i}`}
                      c={c}
                      unidad={unidad}
                      reglaNueva={reglaNueva}
                    />
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-xs font-semibold">Total compras</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {totales.compras_cant != null ? conUnidad(totales.compras_cant) : "—"}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {fmtMxn(totales.compras_mxn)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {precioVigente && (
            <p className="px-1 text-xs text-muted-foreground">{precioVigente}</p>
          )}
        </div>

        {/* ===================== VENTAS ===================== */}
        <div className="overflow-hidden rounded-xl border bg-card self-start">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  colSpan={5}
                  className="h-9 bg-brand-600/10 text-center text-xs font-semibold uppercase tracking-wider text-brand-600"
                >
                  Ventas
                </TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Avión</TableHead>
                <TableHead className="text-right text-xs">Cantidad</TableHead>
                <TableHead className="text-right text-xs">Precio unitario</TableHead>
                <TableHead className="text-right text-xs">Total MXN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-sm text-muted-foreground whitespace-normal"
                  >
                    Sin ventas todavía. Se registran al dar salida a un avión.
                  </TableCell>
                </TableRow>
              ) : (
                ventas.map((v, i) => (
                  <FilaVenta key={v.movimiento_id ?? `${v.fecha}-${i}`} v={v} unidad={unidad} />
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="text-xs font-semibold whitespace-normal">
                  Total vendido
                  {cargadoACosto && (
                    <span className="block font-normal text-muted-foreground">{cargadoACosto}</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums align-top">
                  {unidadesVendidas != null ? conUnidad(unidadesVendidas) : "—"}
                </TableCell>
                <TableCell />
                <TableCell className="text-right text-xs font-semibold tabular-nums align-top">
                  {totales.ventas_mxn != null || ventasUsdSinTc == null ? fmtMxn(totales.ventas_mxn) : null}
                  {ventasUsdSinTc != null && (
                    <span className="block" title="Ventas en dólares sin tipo de cambio">
                      {textoMonto(ventasUsdSinTc, "USD", { signo: false })}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* ===================== RESUMEN ===================== */}
        <div className="overflow-hidden rounded-xl border bg-card self-start">
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
                <TableHead className="text-right text-xs">Existencia</TableHead>
                <TableHead className="bg-emerald-500/10 text-right text-xs text-emerald-700 dark:text-emerald-300">
                  Utilidad / pérdida (MXN)
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
                resumen_diario.map((d) => {
                  const perdida =
                    (numeroONulo(d.utilidad_mxn) ?? 0) < 0 || (numeroONulo(d.utilidad_usd) ?? 0) < 0;
                  return (
                    <TableRow key={d.fecha}>
                      <TableCell className="whitespace-nowrap">{fmtDateOnly(d.fecha)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conUnidad(d.existencia_cierre)}
                        <span className="block text-[11px] text-muted-foreground">
                          {d.entradas_cant > 0 ? `entró ${num(d.entradas_cant)}` : ""}
                          {d.entradas_cant > 0 && d.salidas_cant > 0 ? " · " : ""}
                          {d.salidas_cant > 0 ? `salió ${num(d.salidas_cant)}` : ""}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          perdida ? "bg-red-500/10" : "bg-emerald-500/10",
                        )}
                      >
                        <Utilidad mxn={d.utilidad_mxn} usd={d.utilidad_usd} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-xs font-semibold">Hoy</TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">
                  {conUnidad(totales.existencia_actual)}
                  {bajoMinimo && (
                    <span className="block font-medium text-amber-700 dark:text-amber-400">
                      {bajoMinimo}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-xs font-semibold tabular-nums",
                    (numeroONulo(totales.utilidad_mxn) ?? 0) < 0 ? "bg-red-500/10" : "bg-emerald-500/10",
                  )}
                >
                  <Utilidad mxn={totales.utilidad_mxn} usd={totales.utilidad_usd} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      <DineroGeneradoRenglon dinero={dinero} unidad={unidad} />

      <p className="text-xs text-muted-foreground">
        {reglaNueva ? notaFicha(margen) : NOTA_FICHA_API_PREVIO}
      </p>
    </section>
  );
}

/** Una compra (ENTRADA) o una devolución/ajuste que regresó stock. */
function FilaCompra({
  c,
  unidad,
  reglaNueva,
}: {
  c: ResumenCompra;
  unidad: string | null;
  reglaNueva: boolean;
}) {
  const monedaC = moneda(c.moneda ?? c.moneda_captura);
  // Precio NATIVO (en la moneda de la compra). Con un API previo, el
  // capturado (que es el mismo número).
  const precio = c.precio_unitario ?? c.costo_unitario_capturado;
  const origen = c.proveedor_nombre ?? c.aeronave_matricula ?? null;
  const subTc = subTcCompra(monedaC, c.tc_usd_mxn);
  const totalNativoUsd = monedaC === "USD" ? numeroONulo(c.total) : null;
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <span className="whitespace-nowrap">{fmtDateOnly(c.fecha)}</span>
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
        {(origen || c.referencia || c.compra_id) && (
          <span className="block text-[11px] text-muted-foreground">
            {origen ?? ""}
            {origen && c.referencia ? " · " : ""}
            {c.referencia ? `ref ${c.referencia}` : ""}
            {c.compra_id && (
              <>
                {origen || c.referencia ? " · " : ""}
                <Link
                  href={`/admin/inventory/compras/${c.compra_id}`}
                  className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                >
                  Ver compra
                </Link>
              </>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{num(c.cantidad)}{unidad ? ` ${unidad}` : ""}</TableCell>
      <TableCell className="text-right tabular-nums">
        {c.sin_costo ? (
          <span className="font-medium text-amber-600 dark:text-amber-500">Sin costo</span>
        ) : (
          <>
            {fmtPrecioUnitario(precio, monedaC)}
            {c.es_precio_vigente && (
              <span
                title={TITULO_CHIP_PRECIO_VIGENTE}
                className="ml-1.5 inline-flex rounded-full bg-emerald-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
              >
                {CHIP_PRECIO_VIGENTE}
              </span>
            )}
            {c.sin_tc ? (
              <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-500">
                {SUB_SIN_TC}
              </span>
            ) : subTc ? (
              <span className="block text-[11px] text-muted-foreground">{subTc}</span>
            ) : null}
          </>
        )}
        {reglaNueva && c.tipo !== "ENTRADA" && (
          <span className="block text-[11px] text-muted-foreground">{SUB_NO_CAMBIA_PRECIO}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {c.total_mxn != null ? fmtMxn(c.total_mxn) : <span className="text-muted-foreground">—</span>}
        {totalNativoUsd != null && (
          <span className="block text-[11px] text-muted-foreground">
            {textoMonto(totalNativoUsd, "USD", { signo: false })}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Una salida a un avión (o a toda la flota), con precio o a costo. */
function FilaVenta({ v, unidad }: { v: ResumenVenta; unidad: string | null }) {
  // Moneda NATIVA de lo cobrado (a costo: la del costo).
  const monedaV = moneda(v.moneda ?? (v.a_costo ? v.costo_moneda : v.venta_moneda));
  const precio = v.a_costo
    ? (v.precio_unitario ?? null)
    : (v.precio_unitario ?? v.venta_unitaria_capturada);
  // API previo en una salida a costo: solo el costo unitario en pesos.
  const precioTxt =
    precio != null
      ? fmtPrecioUnitario(precio, monedaV)
      : v.a_costo && v.precio_unitario_mxn != null
        ? fmtPrecioUnitario(v.precio_unitario_mxn, "MXN")
        : "—";
  // El T.C. del día de la VENTA solo se dice cuando hubo dólares de por medio.
  const huboDolares = monedaV === "USD" || v.costo_moneda === "USD";
  const tc = huboDolares ? textoTc(v.tc_venta) : null;
  const totalMxn = v.total_mxn ?? v.costo_mxn ?? null;
  const totalUsd = monedaV === "USD" ? numeroONulo(v.total ?? v.venta_total) : null;
  const gMxn = numeroONulo(v.ganancia_mxn);
  const gUsd = numeroONulo(v.ganancia_usd);
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{fmtDateOnly(v.fecha)}</TableCell>
      <TableCell className="whitespace-normal">
        {v.vendido_a === "FLOTA" ? "Toda la flota" : v.vendido_a}
        {v.referencia && v.referencia !== "0" && (
          <span className="block text-[11px] text-muted-foreground">ref {v.referencia}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{num(v.cantidad)}{unidad ? ` ${unidad}` : ""}</TableCell>
      <TableCell className="text-right tabular-nums">
        {precioTxt}
        {v.a_costo && <span className="block text-[11px] text-muted-foreground">a costo</span>}
        {tc && <span className="block text-[11px] text-muted-foreground">{tc}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {totalMxn != null ? fmtMxn(totalMxn) : <span className="text-muted-foreground">—</span>}
        {totalUsd != null && (
          <span className="block text-[11px] text-muted-foreground">
            {textoMonto(totalUsd, "USD", { signo: false })}
          </span>
        )}
        <span className="block text-[11px]">
          {v.a_costo ? (
            <span className="text-muted-foreground">{TEXTO_A_COSTO}</span>
          ) : gMxn != null ? (
            <span className={claseTono(gMxn)}>{textoUtilidadVenta(gMxn, "MXN")}</span>
          ) : gUsd != null ? (
            // Respaldo: venta y costo en dólares SIN T.C. (filas sin migrar).
            <span className={claseTono(gUsd)} title="Venta en dólares sin tipo de cambio">
              {textoUtilidadVenta(gUsd, "USD")}
            </span>
          ) : v.utilidad_incompleta || v.sin_tc ? (
            <span className="font-medium text-amber-600 dark:text-amber-500">
              utilidad no calculable (sin T.C.)
            </span>
          ) : null}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * «Dinero generado por este producto»: renglón destacado a lo ancho. Lo
 * arma el API (`dinero_generado`); con un API previo, los totales de
 * siempre. El USD original es dato SECUNDARIO; nada se suma aquí.
 */
function DineroGeneradoRenglon({
  dinero,
  unidad,
}: {
  dinero: ReturnType<typeof dineroGeneradoDeTotales>;
  unidad: string | null;
}) {
  const piezas = piezasDineroGenerado(dinero);
  const usd = lineaUsdOriginal(dinero.vendido_usd_original, dinero.utilidad_usd_original);
  const usdSinTc = textoUtilidadUsdSinTc(dinero.utilidad_usd_sin_tc);
  const aCosto = textoDineroACosto(dinero.cargado_a_costo_mxn, dinero.unidades_a_costo, unidad);
  const incompletas = numeroONulo(dinero.ventas_sin_utilidad) ?? 0;
  const sinVentas = piezas.length === 0 && usd == null && usdSinTc == null;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        {TITULO_DINERO}
      </p>
      {sinVentas ? (
        <p className="mt-1 text-sm text-muted-foreground">{SIN_VENTAS}</p>
      ) : piezas.length > 0 ? (
        <p className="mt-1 text-base">
          {piezas.map((p, i) => (
            <span key={p.etiqueta}>
              {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
              {p.etiqueta}{" "}
              <b
                className={cn(
                  "tabular-nums",
                  p.tono === "positivo"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : p.tono === "negativo"
                      ? "text-red-600"
                      : "",
                )}
              >
                {p.monto}
              </b>
            </span>
          ))}
        </p>
      ) : null}
      {usd && <p className="mt-0.5 text-xs text-muted-foreground">{usd}</p>}
      {usdSinTc && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{usdSinTc}</p>}
      {aCosto && <p className="mt-0.5 text-xs text-muted-foreground">{aCosto}</p>}
      {incompletas > 0 && (
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
          {avisoVentasSinUtilidad(incompletas)}
        </p>
      )}
    </div>
  );
}
