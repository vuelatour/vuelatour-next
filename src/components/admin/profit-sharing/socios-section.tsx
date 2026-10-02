import { Fragment } from "react";
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
  TEXTO_ERROR_CARGA_PAGOS,
  TEXTO_PAGOS_NO_DISPONIBLES,
  TEXTO_SOLO_MES_COMPLETO,
  renglonesSociosAvion,
  type ModoPagosReparto,
  type UsuarioEntrega,
} from "@/lib/admin/reparto-pagos";
import { EstadoPagoBadge } from "./estado-pago-badge";
import { PagosSocioDetalle } from "./pagos-socio-detalle";
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
 * Lo que necesita la tarjeta de un avión para pintar los PAGOS A SOCIOS del
 * mes (1-oct-2026). Opcional: sin él la tabla es la de siempre.
 */
export interface ContextoPagosAvion {
  modo: ModoPagosReparto;
  /** ADMIN/FACTURACION: registran, editan y eliminan pagos. */
  puedeRegistrar: boolean;
  /** Opciones de «Entregó» (usuarios activos; vacío si no se pudieron leer). */
  usuarios: UsuarioEntrega[];
  me: UsuarioEntrega;
  /** Hoy en Cancún (`YYYY-MM-DD`): fecha por defecto y tope del pago. */
  hoy: string;
  rol: string | null;
}

/**
 * Reparto a socios de un avión: barra apilada de porcentajes + tabla con la
 * utilidad de cada uno. Con un MES completo y el servidor al día, la tabla
 * gana «Pagado · Pendiente · Estatus» y, por socio, la relación de pagos con
 * «Registrar pago». Los montos vienen del API (mismo saldo); aquí no se
 * calcula dinero.
 */
export function SociosSection({
  socios,
  porcentajeTotal,
  aeronaveId,
  pagos,
}: {
  socios: RepartoSocio[];
  porcentajeTotal: number;
  aeronaveId: string;
  pagos?: ContextoPagosAvion;
}) {
  const modo = pagos?.modo;
  const conPagos = modo?.modo === "ok" ? modo : null;
  const renglones = renglonesSociosAvion(aeronaveId, socios, conPagos ? conPagos.datos.filas : null);

  if (renglones.length === 0) {
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
  const esSocio = pagos?.rol === "SOCIO";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Reparto a socios</p>
        {socios.length > 0 && !pctOk && (
          <p className="text-xs font-medium text-destructive">
            Suman {fmtDecimal(porcentajeTotal)}% (no 100%)
          </p>
        )}
      </div>

      {socios.length > 0 && (
        <>
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
                // Un socio con dos vigencias en el mes llega dos veces.
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
        </>
      )}

      {conPagos && pagos ? (
        // 5 columnas: el % va bajo el nombre y el nombre hace salto de línea.
        // Con 6 columnas sin salto («Aero Charter Cancun S.A. de C.V.») la
        // tabla pedía ~660 px en una tarjeta de ~490 y el ESTATUS quedaba
        // fuera de vista con scroll horizontal.
        <Table data-tabla-pagos-socios>
          <TableHeader>
            <TableRow>
              <TableHead>Socio · %</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead>Estatus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renglones.map((r) => {
              const f = r.fila;
              const sinDato = esSocio
                ? "Solo ves tus propios pagos"
                : "Sin datos de pagos para este socio";
              return (
                <Fragment key={r.socio_id}>
                  <TableRow className={f ? "border-b-0" : undefined} data-socio-renglon={r.socio_id}>
                    <TableCell className="min-w-[8rem] whitespace-normal text-sm">
                      <span className="block leading-tight">{r.socio_nombre}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {fmtDecimal(r.porcentaje)}%
                        {!r.vigente && (
                          <span className="ml-1.5 font-sans text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            ya no vigente
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(r.utilidad_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm" title={f ? undefined : sinDato}>
                      {f ? fmtUsd(f.pagado_usd) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm ${
                        f && f.pendiente_usd > 0 ? "text-amber-700 dark:text-amber-400" : ""
                      }`}
                      title={f ? undefined : sinDato}
                    >
                      {f ? fmtUsd(f.pendiente_usd) : "—"}
                    </TableCell>
                    <TableCell title={f ? undefined : sinDato}>
                      {f ? (
                        <EstadoPagoBadge
                          estado={f.estado}
                          utilidadUsd={f.utilidad_usd}
                          pagadoUsd={f.pagado_usd}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {f && (
                    <TableRow className="hover:bg-transparent" data-socio-pagos={r.socio_id}>
                      <TableCell colSpan={5} className="whitespace-normal pt-0 pb-2.5">
                        <PagosSocioDetalle
                          fila={f}
                          mes={conPagos.mes}
                          puedeRegistrar={pagos.puedeRegistrar}
                          usuarios={pagos.usuarios}
                          me={pagos.me}
                          hoy={pagos.hoy}
                          vigente={r.vigente}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {socios.map((s, i) => (
              <TableRow key={`${s.socio_id}-${i}`}>
                <TableCell className="text-sm">{s.socio_nombre}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {fmtDecimal(s.porcentaje)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmtUsd(s.monto_usd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NotaPagos modo={modo} />
    </div>
  );
}

/** Línea tenue bajo la tabla cuando los pagos no se pueden pintar. */
function NotaPagos({ modo }: { modo: ModoPagosReparto | undefined }) {
  if (!modo) return null;
  switch (modo.modo) {
    case "sin-mes":
      return (
        <p className="text-[11px] text-muted-foreground/80" data-nota-pagos="sin-mes">
          {TEXTO_SOLO_MES_COMPLETO}
        </p>
      );
    case "no-disponible":
      return (
        <p className="text-[11px] text-muted-foreground/80" data-nota-pagos="no-disponible">
          Pagos a socios: {TEXTO_PAGOS_NO_DISPONIBLES}
        </p>
      );
    case "error":
      return (
        <p
          className="text-[11px] text-amber-700 dark:text-amber-400"
          data-nota-pagos="error"
          role="status"
        >
          {TEXTO_ERROR_CARGA_PAGOS}
        </p>
      );
    default:
      return null;
  }
}
