import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import {
  TEXTO_A_COSTO,
  TEXTO_INCOMPLETA,
  avisoVentasSinUtilidad,
  filaUtilidadSalida,
  notaUtilidad,
  numeroONulo,
  partesUtilidad,
  textoMonto,
  tonoDe,
  type MontoMoneda,
} from "@/lib/admin/inventario-utilidad";
import type { InventarioItemResumen } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

const claseTono = (v: number | null | undefined) => {
  const t = tonoDe(v);
  return t === "positivo"
    ? "text-emerald-700 dark:text-emerald-400"
    : t === "negativo"
      ? "text-red-600"
      : "text-muted-foreground";
};

const monto = (m: MontoMoneda | null) => (m ? textoMonto(m.monto, m.moneda, { signo: false }) : "—");

/**
 * «Utilidad por salida» del detalle del producto (25-sep-2026): cada vez que
 * el producto se cargó a un avión — Fecha · Avión · Cantidad · Costo · Venta ·
 * Utilidad — con CADA monto en su moneda. La fila la arma
 * `filaUtilidadSalida` con lo que manda el API (`GET items/:id/resumen`,
 * fuente única `ventaDeSalida`); aquí no se multiplica ni se convierte nada.
 * Pie: la utilidad total por moneda (jamás sumadas).
 */
export function UtilidadPorSalida({
  resumen,
  unidad,
}: {
  resumen: InventarioItemResumen | null;
  unidad?: string | null;
}) {
  // Sin resumen el bloque de arriba ya avisa que no cargó: no se repite.
  if (!resumen) return null;
  const { ventas, totales } = resumen;
  const u = unidad ? ` ${unidad}` : "";
  const totalesPartes = partesUtilidad({
    mxn: numeroONulo(totales.utilidad_mxn),
    usd: numeroONulo(totales.utilidad_usd),
  });
  const incompletas = numeroONulo(totales.ventas_sin_utilidad) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Utilidad por salida</CardTitle>
        <CardDescription>{notaUtilidad(resumen.margen_venta_pct)}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Avión</TableHead>
              <TableHead className="text-right text-xs">Cantidad</TableHead>
              <TableHead className="text-right text-xs">Costo</TableHead>
              <TableHead className="text-right text-xs">Venta</TableHead>
              <TableHead className="text-right text-xs">Utilidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-6 text-center text-sm text-muted-foreground whitespace-normal"
                >
                  Sin salidas a aviones todavía.
                </TableCell>
              </TableRow>
            ) : (
              ventas.map((v, i) => {
                const f = filaUtilidadSalida(v);
                return (
                  <TableRow key={v.movimiento_id ?? `${v.fecha}-${i}`}>
                    <TableCell className="whitespace-nowrap">{fmtDateOnly(v.fecha)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {v.vendido_a === "FLOTA" ? "Toda la flota" : v.vendido_a}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(v.cantidad)}
                      {u}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {monto(f.costo)}
                    </TableCell>
                    {f.estado === "A_COSTO" ? (
                      <TableCell colSpan={2} className="text-right text-xs text-muted-foreground">
                        {TEXTO_A_COSTO}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums">{monto(f.venta)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.estado === "INCOMPLETA" || !f.utilidad ? (
                            <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-normal">
                              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {TEXTO_INCOMPLETA}
                            </span>
                          ) : (
                            <span className={cn("font-medium", claseTono(f.utilidad.monto))}>
                              {textoMonto(f.utilidad.monto, f.utilidad.moneda)}
                            </span>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {ventas.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="text-xs font-semibold whitespace-normal">
                  Utilidad total
                  {incompletas > 0 && (
                    <span className="mt-0.5 block font-normal text-amber-700 dark:text-amber-400">
                      {avisoVentasSinUtilidad(incompletas)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums align-top">
                  {totalesPartes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    totalesPartes.map((p) => (
                      <span key={p.moneda} className={cn("block", claseTono(p.monto))}>
                        {p.texto}
                      </span>
                    ))
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}
