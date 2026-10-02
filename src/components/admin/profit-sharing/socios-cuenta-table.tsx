"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
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
import { fmtUsd } from "@/lib/format";
import {
  ETIQUETA_COLUMNA_SALDO,
  ETIQUETA_VER_CUENTA,
  claseTextoSaldo,
  contextoEntrega,
  hrefCuentaSocio,
  marcaSaldoAdelantado,
  textoAvionDeSocio,
  textoCuentaNoConfigurada,
  textoMesEnCurso,
  textoUltimoPago,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import type { ResumenCuentaSocio, TotalesCuentasSocios } from "@/types/reparto-pagos";
import { EstadoCuentaBadge } from "./estado-cuenta-badge";
import { BotonRegistrarEntrega } from "./entrega-socio-dialog";
import { BotonConfigurarCuenta } from "./cuenta-socio-dialog";

/**
 * Tabla de «Pagos a socios» (`/admin/profit-sharing/socios`): una fila por
 * socio con lo que ha GENERADO, lo ENTREGADO, lo POR ENTREGAR, su estado y
 * la última entrega. Todo lo calcula el API (`GET /v1/profit-sharing/socios`);
 * la tabla solo pinta. Tabla de RESUMEN (con totales) ⇒ primitivos de
 * `ui/table`, no `DataTable`.
 */
export function SociosCuentaTable({
  socios,
  totales,
  hastaMes,
  puedeRegistrar,
  registro,
}: {
  socios: ResumenCuentaSocio[];
  totales: TotalesCuentasSocios | null;
  /** `YYYY-MM` del mes en curso (para «incluye $X de Octubre 2026»). */
  hastaMes: string | null;
  /** ADMIN/FACTURACION: registran entregas y configuran cuentas. */
  puedeRegistrar: boolean;
  registro: ContextoRegistro;
}) {
  return (
    <Table data-tabla-cuentas-socios>
      <TableHeader>
        <TableRow>
          <TableHead>Socio</TableHead>
          <TableHead className="text-right">Generado</TableHead>
          <TableHead className="text-right">Entregado</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_SALDO}</TableHead>
          <TableHead>Estatus</TableHead>
          <TableHead>Última entrega</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {socios.map((s) => {
          const enCurso = textoMesEnCurso(s.mes_en_curso_usd, hastaMes);
          const adelantado = marcaSaldoAdelantado(s.estado, s.por_entregar_usd);
          return (
            <TableRow key={s.socio.id} data-socio-cuenta={s.socio.id}>
              <TableCell className="min-w-[11rem] whitespace-normal align-top text-sm">
                <Link
                  href={hrefCuentaSocio(s.socio.id)}
                  className="font-medium leading-tight underline-offset-2 hover:underline"
                >
                  {s.socio.nombre}
                </Link>
                {s.aviones.length > 0 && (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {s.aviones.map(textoAvionDeSocio).join(" · ")}
                  </span>
                )}
                {(s.avisos ?? []).map((aviso) => (
                  <span
                    key={aviso}
                    className="mt-1 block text-[11px] leading-snug text-amber-700 dark:text-amber-400"
                    data-aviso-cuenta
                  >
                    {aviso}
                  </span>
                ))}
                {!s.cuenta.configurada && (
                  <span
                    className="mt-1 inline-block rounded border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    title={textoCuentaNoConfigurada({
                      puedeConfigurar: puedeRegistrar,
                      esPropia: registro.me.id === s.socio.id,
                    })}
                    data-cuenta-sin-configurar
                  >
                    Cuenta sin configurar
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right align-top font-mono text-sm">
                {fmtUsd(s.generado_usd)}
                {enCurso && (
                  <span className="mt-0.5 block whitespace-normal font-sans text-[10px] text-muted-foreground">
                    {enCurso}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right align-top font-mono text-sm">
                {fmtUsd(s.entregado_usd)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right align-top font-mono text-sm font-semibold",
                  claseTextoSaldo(s.estado, s.por_entregar_usd),
                )}
              >
                {fmtUsd(s.por_entregar_usd)}
                {adelantado && (
                  <span className="mt-0.5 block font-sans text-[10px] font-normal" data-marca-adelantado>
                    {adelantado}
                  </span>
                )}
              </TableCell>
              <TableCell className="align-top">
                <EstadoCuentaBadge estado={s.estado} saldoUsd={s.por_entregar_usd} />
              </TableCell>
              <TableCell className="min-w-[10rem] whitespace-normal align-top text-xs text-muted-foreground">
                {textoUltimoPago(s.ultimo_pago)}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap justify-end gap-1">
                  {puedeRegistrar && (
                    <BotonRegistrarEntrega
                      contexto={contextoEntrega(s, { mesEnCurso: hastaMes })}
                      registro={registro}
                    />
                  )}
                  <Link
                    href={hrefCuentaSocio(s.socio.id)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer gap-1")}
                    data-accion="ver-cuenta-socio"
                    aria-label={`${ETIQUETA_VER_CUENTA} de ${s.socio.nombre}`}
                  >
                    {ETIQUETA_VER_CUENTA}
                    <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  {puedeRegistrar && (
                    <BotonConfigurarCuenta
                      socio={{ id: s.socio.id, nombre: s.socio.nombre }}
                      cuenta={s.cuenta}
                      hoy={registro.hoy}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {totales && (
        <TableFooter>
          <TableRow>
            <TableCell className="text-sm font-semibold">Total</TableCell>
            <TableCell className="text-right font-mono text-sm font-semibold">
              {fmtUsd(totales.generado_usd)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm font-semibold">
              {fmtUsd(totales.entregado_usd)}
            </TableCell>
            <TableCell
              className="text-right font-mono text-sm font-semibold"
              title="Suma de los saldos a favor de los socios. Un adelanto no compensa lo que se le debe a otro socio: va aparte."
            >
              {fmtUsd(totales.por_entregar_usd)}
              {(totales.adelantado_usd ?? 0) > 0 && (
                <span className="mt-0.5 block font-sans text-[10px] font-normal text-sky-700 dark:text-sky-300">
                  adelantado {fmtUsd(totales.adelantado_usd)}
                </span>
              )}
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
