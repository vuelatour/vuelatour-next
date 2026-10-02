"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import {
  AYUDA_COLUMNAS_CUENTA,
  claseTextoSaldoCorrido,
  conceptoEntregaCuenta,
  esRenglonDeSaldo,
  etiquetaTipoMovimiento,
  importesMovimiento,
  piezasPago,
  type ContextoEntrega,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import type { MovimientoCuenta, PagoSocio } from "@/types/reparto-pagos";
import { EntregaSocioDialog, type DialogoEntrega } from "./entrega-socio-dialog";
import { EliminarEntregaDialog } from "./eliminar-entrega-dialog";
import { ComprobanteEntrega } from "./comprobante-entrega";

/**
 * Movimientos del estado de cuenta de UN socio con el SALDO CORRIDO (todo
 * del API): saldo inicial/anterior, una utilidad por mes y avión (el mes en
 * curso marcado) y cada entrega con método · entregó · recibió/factura ·
 * referencia · comprobante, «Editar» y «Eliminar» (ADMIN/FACTURACION).
 *
 * El concepto de una ENTREGA lo redacta `conceptoEntregaCuenta` («Entrega ·
 * corresponde a Septiembre 2026» / «Entrega a cuenta (sin mes)»): el del API
 * repetía monto, T.C. y referencia (ya están en el detalle) y decía
 * «Adelanto a cuenta» a toda entrega sin mes. El SALDO negativo se pinta en
 * azul (adelantado) y el positivo en ámbar, con la tolerancia del API.
 */
export function MovimientosCuenta({
  movimientos,
  contexto,
  registro,
  puedeRegistrar,
}: {
  movimientos: MovimientoCuenta[];
  /** Para editar una entrega (socio, aviones, arranque de la cuenta). */
  contexto: ContextoEntrega;
  registro: ContextoRegistro;
  puedeRegistrar: boolean;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<(DialogoEntrega & { clave: string }) | null>(null);
  const [aEliminar, setAEliminar] = useState<PagoSocio | null>(null);
  const contador = useRef(0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{AYUDA_COLUMNAS_CUENTA}</p>
      <Table data-tabla-movimientos>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead className="text-right">Generó (+)</TableHead>
            <TableHead className="text-right">Entregado (−)</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimientos.map((m, i) => {
            const { suma, resta } = importesMovimiento(m);
            const saldo = esRenglonDeSaldo(m.tipo);
            const pago = m.tipo === "ENTREGA" ? m.pago : null;
            const p = pago ? piezasPago(pago) : null;
            const extras = p ? ([p.recibio, p.factura, p.referencia].filter(Boolean) as string[]) : [];
            return (
              <Fragment key={pago?.id ?? `${m.tipo}-${m.fecha}-${m.aeronave?.id ?? ""}-${i}`}>
                <TableRow
                  className={cn(saldo && "bg-muted/40", pago && "border-b-0")}
                  data-movimiento={m.tipo}
                  data-en-curso={m.en_curso ? "" : undefined}
                >
                  <TableCell className="whitespace-nowrap align-top text-xs">
                    {fmtDateOnly(m.fecha)}
                  </TableCell>
                  <TableCell className="min-w-[14rem] whitespace-normal align-top text-sm">
                    <span className={cn(saldo && "font-medium")}>
                      {pago ? conceptoEntregaCuenta(pago) : m.concepto || etiquetaTipoMovimiento(m.tipo)}
                    </span>
                    {m.en_curso && (
                      <span
                        className="ml-1.5 inline-block rounded border border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                        title="El mes todavía no cierra: esta utilidad cambia día con día."
                      >
                        en curso
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right align-top font-mono text-sm",
                      suma != null && suma < 0
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {suma != null ? fmtUsd(suma) : ""}
                  </TableCell>
                  <TableCell className="text-right align-top font-mono text-sm">
                    {resta != null ? fmtUsd(resta) : ""}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right align-top font-mono text-sm font-medium",
                      claseTextoSaldoCorrido(m.saldo_usd),
                    )}
                  >
                    {fmtUsd(m.saldo_usd)}
                  </TableCell>
                </TableRow>
                {pago && p && (
                  <TableRow className="hover:bg-transparent" data-entrega-id={pago.id}>
                    <TableCell />
                    <TableCell colSpan={4} className="whitespace-normal pt-0 pb-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5">
                        <div className="min-w-0 space-y-0.5 text-xs">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="font-mono">{p.monto}</span>
                            <span aria-hidden className="text-muted-foreground">·</span>
                            <span>{p.metodo}</span>
                            <span aria-hidden className="text-muted-foreground">·</span>
                            <span>{p.entrego}</span>
                          </p>
                          {extras.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">{extras.join(" · ")}</p>
                          )}
                          {pago.notas && (
                            <p className="whitespace-pre-line text-[11px] text-muted-foreground">
                              {pago.notas}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/80">{p.registro}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          <ComprobanteEntrega pago={pago} puedeAdjuntar={puedeRegistrar} />
                          {puedeRegistrar && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                title="Corregir esta entrega"
                                aria-label={`Editar la entrega del ${p.fecha} por ${p.monto}`}
                                data-accion="editar-entrega-socio"
                                onClick={() => {
                                  contador.current += 1;
                                  setDialogo({
                                    tipo: "edicion",
                                    contexto,
                                    pago,
                                    clave: `edicion-${contador.current}`,
                                  });
                                }}
                              >
                                <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                                title="Eliminar esta entrega (capturada por error)"
                                aria-label={`Eliminar la entrega del ${p.fecha} por ${p.monto}`}
                                data-accion="eliminar-entrega-socio"
                                onClick={() => setAEliminar(pago)}
                              >
                                <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                                Eliminar
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {puedeRegistrar && (
        <>
          <EntregaSocioDialog dialogo={dialogo} onCerrar={() => setDialogo(null)} registro={registro} />
          <EliminarEntregaDialog
            pago={aEliminar}
            socioNombre={contexto.socio.nombre}
            onCerrar={() => setAEliminar(null)}
            onEliminado={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}
