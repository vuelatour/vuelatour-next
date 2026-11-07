"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateOnly } from "@/lib/datetime";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { hrefCompraDeGasto, hrefGastoEnfocado } from "@/lib/admin/gasto-enfocado";
import {
  BOTON_CONVERTIR_EN_COMPRA,
  ETIQUETA_VER_EDITAR_GASTO,
  TEXTO_CONVERTIR_FALLO,
  TEXTO_GASTO_CONCILIADO,
  TEXTO_GASTO_SIN_CONCILIAR,
  TITULO_CONVERTIR_EN_COMPRA,
  TITULO_VER_EDITAR_GASTO,
  conceptoRefaccion,
  textoCompraCreadaDesdeGasto,
} from "@/lib/admin/compras-estado";
import { createCompraAction } from "@/app/admin/inventory/compras/actions";
import { fmtMontoMoneda } from "@/types/compras";
import type { Gasto } from "@/types/expenses";

/**
 * «Refacciones registradas como gasto (por convertir)» (6-nov-2026, pedido de
 * Pablo: «sacar de Gastos todo lo que tenga que ver con refacciones; todo se
 * mete por la tienda»). Son los gastos REFACCION sin compra (y que no son
 * salidas de bodega) que se capturaron antes de que la tienda los llevara. Ya
 * no salen en Gastos (`sin_refacciones`); aquí cada uno tiene «Convertir en
 * compra»: `POST /v1/compras { gasto_mercancia_id }` (el API deriva proveedor,
 * fecha, moneda, T.C. y las líneas de la lectura de la IA, o una sola línea)
 * y se abre el detalle de la compra para recibirla en bodega. Sus números no
 * cambian hasta que la oficina la convierte: solo cambian de pantalla.
 */
export function RefaccionesPorConvertirTable({ gastos }: { gastos: Gasto[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const convertir = (g: Gasto) => {
    setEnCurso(g.id);
    startTransition(async () => {
      const r = await createCompraAction({ gasto_mercancia_id: g.id });
      if (r.ok && r.data) {
        toast.success(textoCompraCreadaDesdeGasto(r.data.folio));
        router.push(hrefCompraDeGasto(r.data.id));
        return;
      }
      toast.error(r.error ?? TEXTO_CONVERTIR_FALLO);
      setEnCurso(null);
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Concepto</TableHead>
          <TableHead>Proveedor</TableHead>
          <TableHead>Avión</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Medio</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead>Comprobante</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gastos.map((g) => {
          const ocupado = pending && enCurso === g.id;
          return (
            <TableRow key={g.id} data-refaccion-por-convertir={g.id}>
              <TableCell className="whitespace-nowrap">{fmtDateOnly(g.fecha_gasto)}</TableCell>
              <TableCell className="max-w-[28rem]">
                <p className="truncate" title={g.notas ?? undefined}>
                  {conceptoRefaccion(g)}
                </p>
              </TableCell>
              <TableCell>{g.proveedor?.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="font-mono">
                {g.aeronave?.matricula ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
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
                <div className="flex items-center justify-end gap-3">
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    data-convertir-en-compra={g.id}
                    title={TITULO_CONVERTIR_EN_COMPRA}
                    disabled={ocupado}
                    onClick={() => convertir(g)}
                  >
                    <ShoppingCartIcon className="h-4 w-4" />
                    {ocupado ? "Creando…" : BOTON_CONVERTIR_EN_COMPRA}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
