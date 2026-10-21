"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtMxn, fmtUsd } from "@/lib/format";
import {
  ETIQUETA_ATAJO_CUENTA_SOCIO,
  TITULO_ATAJO_CUENTA_SOCIO,
  fmtPct,
  hrefCuentaSocioDesdeReparto,
  type ContextoEntrega,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import {
  ETIQUETA_COLUMNA_A_RECIBIR,
  ETIQUETA_COLUMNA_ENTREGADO_AVION,
  ETIQUETA_COLUMNA_POR_ENTREGAR_AVION,
  ETIQUETA_COLUMNA_RESERVA_A_GUARDAR,
  ETIQUETA_COLUMNA_UTILIDAD,
  TEXTO_SIN_SOCIOS_AVION,
  textoPorEntregarAvion,
} from "@/lib/admin/reparto-avion";
import type { SocioAvionDetalle } from "@/types/profit-sharing";
import { BotonRegistrarEntrega } from "./entrega-socio-dialog";
import { ReservaSocioControl } from "./reserva-socio-control";

export interface FilaSocioAvion {
  socio: SocioAvionDetalle;
  /** Renglones de `aeronave_socio` del socio en el periodo (el PATCH del descuento). */
  ownerIds: string[];
  /** Contexto de «Registrar entrega» (null = no se puede registrar). */
  contexto: ContextoEntrega | null;
}

/**
 * «Socios de este avión» (20-oct-2026, API 0.0.101): socio, %, utilidad
 * MXN, reserva a guardar con «se le descuenta» / «solo informativa» (y el
 * control para cambiarlo, solo ADMIN), a recibir, entregado por ESTE avión
 * en el periodo, por entregar, «Registrar entrega» (avión y socio
 * preseleccionados) y el atajo a su cuenta. Todo lo manda el API; la tabla
 * solo pinta (tabla de RESUMEN ⇒ primitivos de `ui/table`).
 */
export function SociosAvionTable({
  aeronaveId,
  matricula,
  filas,
  puedeCambiarReserva,
  puedeRegistrar,
  registro,
  rol,
  usuarioId,
}: {
  aeronaveId: string;
  matricula: string;
  filas: FilaSocioAvion[];
  puedeCambiarReserva: boolean;
  puedeRegistrar: boolean;
  registro: ContextoRegistro;
  rol: string | null;
  usuarioId: string | null;
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground">{TEXTO_SIN_SOCIOS_AVION}</p>;
  }
  return (
    <Table data-tabla-socios-avion>
      <TableHeader>
        <TableRow>
          <TableHead>Socio</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_UTILIDAD}</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_RESERVA_A_GUARDAR}</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_A_RECIBIR}</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_ENTREGADO_AVION}</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_POR_ENTREGAR_AVION}</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map(({ socio: s, ownerIds, contexto }) => {
          const hrefCuenta = hrefCuentaSocioDesdeReparto({ rol, usuarioId }, s.socio_id);
          const porEntregar = textoPorEntregarAvion(s.por_entregar_mxn);
          return (
            <TableRow key={s.socio_id} data-socio-avion={s.socio_id}>
              <TableCell className="min-w-[10rem] whitespace-normal align-top text-sm">
                {hrefCuenta ? (
                  <Link
                    href={hrefCuenta}
                    title={TITULO_ATAJO_CUENTA_SOCIO}
                    aria-label={`${ETIQUETA_ATAJO_CUENTA_SOCIO} de ${s.socio_nombre}`}
                    className="cursor-pointer font-medium underline-offset-2 hover:underline"
                  >
                    {s.socio_nombre}
                  </Link>
                ) : (
                  <span className="font-medium">{s.socio_nombre}</span>
                )}
              </TableCell>
              <TableCell className="text-right align-top font-mono text-xs">{fmtPct(s.porcentaje)}</TableCell>
              <TableCell className="text-right align-top font-mono text-sm">{fmtMxn(s.utilidad_mxn)}</TableCell>
              <TableCell className="min-w-[11rem] whitespace-normal text-right align-top font-mono text-sm">
                {fmtMxn(s.reserva_mxn)}
                <span className="mt-0.5 block font-sans text-[10px] text-muted-foreground">
                  ≈ {fmtUsd(s.reserva_usd)} USD
                </span>
                <span className="mt-1 block font-sans">
                  <ReservaSocioControl
                    aeronaveId={aeronaveId}
                    matricula={matricula}
                    socio={{ id: s.socio_id, nombre: s.socio_nombre }}
                    ownerIds={ownerIds}
                    descuenta={s.descuenta_reserva}
                    puedeCambiar={puedeCambiarReserva}
                  />
                </span>
              </TableCell>
              <TableCell className="text-right align-top font-mono text-sm font-semibold" data-a-recibir={s.socio_id}>
                {fmtMxn(s.monto_mxn)}
                <span className="mt-0.5 block font-sans text-[10px] font-normal text-muted-foreground">
                  ≈ {fmtUsd(s.monto_usd)} USD
                </span>
              </TableCell>
              <TableCell className="text-right align-top font-mono text-sm">{fmtMxn(s.entregado_mxn)}</TableCell>
              <TableCell
                className={cn(
                  "text-right align-top font-mono text-sm font-semibold",
                  porEntregar.tono === "ambar" && "text-amber-700 dark:text-amber-400",
                  porEntregar.tono === "azul" && "text-sky-700 dark:text-sky-300",
                )}
                data-por-entregar-avion={s.socio_id}
              >
                {porEntregar.texto}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap justify-end gap-1">
                  {puedeRegistrar && contexto && (
                    <BotonRegistrarEntrega contexto={contexto} registro={registro} />
                  )}
                  {hrefCuenta && (
                    <Link
                      href={hrefCuenta}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer gap-1")}
                      data-accion="ver-cuenta-socio"
                      aria-label={`${ETIQUETA_ATAJO_CUENTA_SOCIO} de ${s.socio_nombre}`}
                    >
                      {ETIQUETA_ATAJO_CUENTA_SOCIO}
                      <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
