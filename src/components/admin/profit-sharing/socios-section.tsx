import Link from "next/link";
import { UsersIcon } from "@heroicons/react/24/outline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import {
  ETIQUETA_ATAJO_CUENTA_SOCIO,
  TITULO_ATAJO_CUENTA_SOCIO,
  hrefCuentaSocioDesdeReparto,
} from "@/lib/admin/reparto-pagos";
import type { RepartoSocio } from "@/types/profit-sharing";

/** Paleta fija del design system para distinguir socios (máx. 4 y cicla). */
const PALETA = ["bg-brand-600", "bg-navy-500", "bg-navy-300", "bg-navy-700"];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Reparto a socios de un avión: barra apilada de porcentajes + tabla «Socio ·
 * % · Utilidad del periodo». Los montos vienen del API (mismo saldo). Lo
 * entregado y lo por entregar NO van aquí: viven en la cuenta corriente de
 * cada socio («Socios · por entregar» arriba y «Pagos a socios»). Desde el
 * 2-oct-2026 el NOMBRE del socio es un atajo a esa cuenta (donde está
 * «Registrar entrega»): pedido del cliente «al lado del nombre del socio
 * puede mandar al detalle para pagar al socio». Quién ve el atajo lo decide
 * `hrefCuentaSocioDesdeReparto` (rol + usuario: un SOCIO solo la suya).
 */
export function SociosSection({
  socios,
  porcentajeTotal,
  aeronaveId,
  rol = null,
  usuarioId = null,
}: {
  socios: RepartoSocio[];
  porcentajeTotal: number;
  aeronaveId: string;
  /** Rol y usuario de quien mira (para el atajo a la cuenta del socio). */
  rol?: string | null;
  usuarioId?: string | null;
}) {
  if (socios.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-center">
        <UsersIcon className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-1 text-xs text-muted-foreground">
          Sin socios configurados para esta aeronave.{" "}
          <Link
            href={`/admin/aircraft/${aeronaveId}`}
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Configúralos en la ficha del avión
          </Link>
          .
        </p>
      </div>
    );
  }

  const pctOk = porcentajeTotal === 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Reparto a socios</p>
        {!pctOk && (
          <p className="text-xs font-medium text-destructive">
            Suman {fmtDecimal(porcentajeTotal)}% (no 100%)
          </p>
        )}
      </div>

      {/* Barra apilada de porcentajes (ancho relativo al 100%). */}
      <div
        role="img"
        aria-label={`Porcentajes de socios: ${socios
          .map((s) => `${s.socio_nombre} ${fmtDecimal(s.porcentaje)}%`)
          .join(", ")}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {socios.map((s, i) => (
          <div
            // Un socio con dos vigencias en el mes llega dos veces: la llave
            // lleva el índice.
            key={`${s.socio_id}-${i}`}
            className={PALETA[i % PALETA.length]}
            style={{ width: `${Math.max(0, Math.min(100, s.porcentaje))}%` }}
            title={`${s.socio_nombre} · ${fmtDecimal(s.porcentaje)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {socios.map((s, i) => (
          <span
            key={`${s.socio_id}-${i}`}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${PALETA[i % PALETA.length]}`}
            />
            <span className="font-medium text-foreground">{iniciales(s.socio_nombre)}</span>
            {fmtDecimal(s.porcentaje)}%
          </span>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Socio</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Utilidad del periodo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {socios.map((s, i) => {
            const hrefCuenta = hrefCuentaSocioDesdeReparto({ rol, usuarioId }, s.socio_id);
            return (
            <TableRow key={`${s.socio_id}-${i}`}>
              <TableCell className="text-sm">
                {hrefCuenta ? (
                  // Atajo a la cuenta del socio (ahí vive «Registrar
                  // entrega»): el nombre es el enlace y el «Ver cuenta ›» a
                  // su lado lo hace evidente sin leer el tooltip.
                  <span className="inline-flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={hrefCuenta}
                      title={TITULO_ATAJO_CUENTA_SOCIO}
                      aria-label={`${ETIQUETA_ATAJO_CUENTA_SOCIO} de ${s.socio_nombre}`}
                      className="cursor-pointer font-medium hover:underline underline-offset-2"
                    >
                      {s.socio_nombre}
                    </Link>
                    <Link
                      href={hrefCuenta}
                      tabIndex={-1}
                      aria-hidden
                      className="cursor-pointer text-[11px] text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {ETIQUETA_ATAJO_CUENTA_SOCIO} ›
                    </Link>
                  </span>
                ) : (
                  s.socio_nombre
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {fmtDecimal(s.porcentaje)}%
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmtUsd(s.monto_usd)}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
