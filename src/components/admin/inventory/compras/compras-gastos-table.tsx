"use client";

import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateOnly } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { hrefCompraDeGasto, hrefGastoEnfocado } from "@/lib/admin/gasto-enfocado";
import {
  ETIQUETA_VER_EDITAR_GASTO,
  TEXTO_GASTO_CONCILIADO,
  TEXTO_GASTO_SIN_CONCILIAR,
  TITULO_VER_EDITAR_GASTO,
  etiquetaRolCompra,
} from "@/lib/admin/compras-estado";
import { fmtMontoMoneda } from "@/types/compras";
import type { Gasto } from "@/types/expenses";

/**
 * «Gastos de compras» (6-nov-2026, API 0.0.122, invariante 118 del API): todos
 * los pagos ligados a una compra de refacciones, apartados de Gastos (como la
 * nómina en su módulo). Cada renglón enlaza a su compra y a «Ver / editar»
 * (Gastos enfocado, que en esa vista sí incluye los gastos de compras). Solo
 * pinta lo que manda el API; textos en `lib/admin/compras-estado.ts`.
 */
export function ComprasGastosTable({ gastos }: { gastos: Gasto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Compra</TableHead>
          <TableHead>Qué pagó</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Proveedor</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Medio</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead>Comprobante</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gastos.map((g) => (
          <TableRow key={g.id} data-gasto-compra={g.id}>
            <TableCell className="whitespace-nowrap">{fmtDateOnly(g.fecha_gasto)}</TableCell>
            <TableCell>
              {g.compra_id ? (
                <Link
                  href={hrefCompraDeGasto(g.compra_id)}
                  prefetch={false}
                  className="font-mono hover:underline underline-offset-2"
                >
                  #{g.compra?.folio ?? "?"}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              {g.compra?.proveedor?.nombre && (
                <p className="text-[11px] text-muted-foreground">{g.compra.proveedor.nombre}</p>
              )}
            </TableCell>
            <TableCell>{etiquetaRolCompra(g.compra_rol)}</TableCell>
            <TableCell>{categoriaGastoLabel(g.categoria)}</TableCell>
            <TableCell>{g.proveedor?.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
              {fmtMontoMoneda(g.monto, g.moneda)}
            </TableCell>
            <TableCell className="whitespace-nowrap">{medioPagoLabel(g.medio_pago)}</TableCell>
            <TableCell>
              <span
                data-conciliado={g.conciliado ? "1" : "0"}
                className={
                  g.conciliado
                    ? "inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                    : "inline-flex rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                }
              >
                {g.conciliado ? TEXTO_GASTO_CONCILIADO : TEXTO_GASTO_SIN_CONCILIAR}
              </span>
            </TableCell>
            <TableCell>{g.foto_url ? "Sí" : <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell className="text-right">
              <Link
                href={hrefGastoEnfocado(g)}
                prefetch={false}
                data-abrir-gasto={g.id}
                title={TITULO_VER_EDITAR_GASTO}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                {ETIQUETA_VER_EDITAR_GASTO}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
