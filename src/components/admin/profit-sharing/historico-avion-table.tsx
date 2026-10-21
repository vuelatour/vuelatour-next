"use client";

import { useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_MENOS_COLUMNAS,
  ETIQUETA_VER_TODAS_COLUMNAS,
  TEXTO_SIN_MESES_HISTORICO,
  TITULO_PESOS_SIN_TC_MES,
  celdasTotalesHistorico,
  columnasHistorico,
  filasHistorico,
} from "@/lib/admin/reparto-avion";
import type { MesHistoricoAvion, TotalesHistoricoAvion } from "@/types/profit-sharing";

/**
 * Tabla del histórico mes a mes de un avión (20-oct-2026, API 0.0.101): un
 * renglón por mes con la cascada EN PESOS, el saldo, la reserva informativa,
 * lo entregado y el estado del cierre; fila de totales. Fácil de leer: por
 * defecto solo las columnas principales (mes, horas, vuelos, cobrado, saldo,
 * reserva, entregado, cierre) y un botón «Ver todas las columnas» para la
 * cascada completa; la tabla hace scroll horizontal en el celular. Los
 * números son del API.
 */
export function HistoricoAvionTable({
  meses,
  totales,
}: {
  meses: MesHistoricoAvion[];
  totales: TotalesHistoricoAvion;
}) {
  const [completas, setCompletas] = useState(false);
  if (meses.length === 0) return <p className="text-sm text-muted-foreground">{TEXTO_SIN_MESES_HISTORICO}</p>;
  const columnas = columnasHistorico(completas);
  const filas = filasHistorico(meses);
  const totalesCeldas = celdasTotalesHistorico(totales);
  return (
    <div className="space-y-2" data-tabla-historico-avion>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer"
          aria-pressed={completas}
          data-accion="columnas-historico"
          onClick={() => setCompletas((v) => !v)}
        >
          {completas ? ETIQUETA_MENOS_COLUMNAS : ETIQUETA_VER_TODAS_COLUMNAS}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              {columnas.map((c) => (
                <TableHead
                  key={c.clave}
                  className={cn(c.tipo === "texto" ? "" : "text-right", c.informativa && "text-muted-foreground")}
                  title={c.title}
                >
                  {c.etiqueta}
                  {c.informativa && (
                    <span className="block text-[10px] font-normal text-muted-foreground">no se resta</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.mes} data-mes-historico={f.mes} data-en-curso={f.enCurso ? "" : undefined}>
                <TableCell className="whitespace-nowrap text-sm font-medium">
                  {f.etiqueta}
                  {f.pesosIncompletos && (
                    <ExclamationTriangleIcon
                      className="ml-1 inline h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                      aria-label={TITULO_PESOS_SIN_TC_MES}
                    />
                  )}
                </TableCell>
                {columnas.map((c) => (
                  <TableCell
                    key={c.clave}
                    className={cn(
                      "whitespace-nowrap text-xs",
                      c.tipo === "texto" ? "" : "text-right font-mono",
                      c.informativa && "text-muted-foreground",
                      c.clave === "saldo_mxn" &&
                        (f.saldoNegativo ? "font-semibold text-destructive" : "font-semibold text-emerald-700 dark:text-emerald-400"),
                    )}
                  >
                    {c.clave === "cierre" ? (
                      f.cierre ? (
                        <span
                          className={cn(
                            "inline-block rounded border px-1.5 text-[10px] font-medium",
                            f.cierre === "Cerrado"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {f.cierre}
                        </span>
                      ) : (
                        ""
                      )
                    ) : (
                      f.celdas[c.clave]
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-xs font-semibold">Total · {filas.length} mes(es)</TableCell>
              {columnas.map((c) => (
                <TableCell
                  key={c.clave}
                  className={cn(
                    "whitespace-nowrap text-xs font-semibold",
                    c.tipo === "texto" ? "" : "text-right font-mono",
                    c.informativa && "text-muted-foreground",
                  )}
                  data-total-historico={c.clave}
                >
                  {totalesCeldas[c.clave]}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
