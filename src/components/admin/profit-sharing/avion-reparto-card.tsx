import Link from "next/link";
import {
  ArrowRightIcon,
  ClockIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { CierreRepartoAvion } from "./cierre-reparto-aviso";
import type { CierrePeriodoAditivo } from "@/types/cierres";
import { SociosSection } from "./socios-section";
import { CascadaAvion } from "./cascada-avion";
import { cn } from "@/lib/utils";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import {
  TITULO_BADGE_OTROS_INGRESOS_SIN_TC,
  TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL,
  textoBadgeOtrosIngresosSinTc,
  textoBadgeOtrosIngresosTcOficial,
} from "@/lib/admin/otros-ingresos-avion";
import {
  TITULO_OTROS_INGRESOS_SIN_TC_PESOS,
  textoBadgePendientePesos,
  textoDeudaTotalPesos,
  tituloBadgePendientePesos,
  tituloGastosSinTcPesos,
} from "@/lib/admin/reparto-pesos";
import {
  ETIQUETA_VER_DETALLE_AVION,
  hrefRepartoAvion,
  saldoCascada,
} from "@/lib/admin/reparto-avion";
import type { AvionReparto } from "@/types/profit-sharing";

const AMBAR =
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
/** Informativo (no advertencia): convertido con el TC oficial de referencia. */
const INFO =
  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30";

/**
 * Card RESUMEN de un avión en el reparto (20-oct-2026, API 0.0.101): el
 * detalle vive en `/admin/profit-sharing/aviones/[id]` («Ver detalle del
 * avión →»). Aquí: matrícula, modelo, saldo disponible, los avisos de
 * siempre, la cascada (con la fila «Provisión AFAC» y la reserva de
 * overhaul DEBAJO del saldo, informativa: ya no resta), un renglón por
 * socio con lo que recibe, los vuelos de este avión que pasan / vienen por
 * el cierre de mes y la descarga del balance en Excel. El desglose vuelo
 * por vuelo y gasto por gasto se fue a la pantalla del avión.
 *
 * Reparto EN PESOS (18-oct-2026, API 0.0.93): con `enPesos` el saldo, cada
 * fila de la cascada y lo de cada socio pintan los PESOS que manda el API y
 * los dólares debajo, en gris (`montoPrincipal`). Sin la bandera, dólares.
 * Sin `comoBalance` (API ≤ 0.0.100) la reserva resta como siempre.
 */
export function AvionRepartoCard({
  avion,
  desde,
  hasta,
  puedeDescargarBalance = true,
  rol = null,
  usuarioId = null,
  cierre = null,
  enPesos = false,
  comoBalance = false,
}: {
  avion: AvionReparto;
  desde: string;
  hasta: string;
  /** El endpoint del balance es ADMIN/ANALISTA: al SOCIO no se le pinta un
   *  botón que siempre respondería 403. */
  puedeDescargarBalance?: boolean;
  /** Quién mira (rol + usuario): decide el atajo a la cuenta de cada socio
   *  en la tabla de reparto (`hrefCuentaSocioDesdeReparto`). */
  rol?: string | null;
  usuarioId?: string | null;
  /** Cierre de mes (ADITIVO, API 0.0.88): `cierre` de la raíz del reparto;
   *  la card pinta los vuelos de ESTE avión que pasan / vienen. */
  cierre?: CierrePeriodoAditivo | null;
  /** Bandera raíz `reparto_en_pesos` del API (`repartoEnPesos`). */
  enPesos?: boolean;
  /** Bandera raíz `reparto_como_balance` del API (`repartoComoBalance`). */
  comoBalance?: boolean;
}) {
  const saldo = saldoCascada(avion, enPesos);
  const positivo = (saldo.valor ?? avion.saldo_disponible_usd) >= 0;
  const totalVuelos =
    avion.ingresos.vuelos_cobrados + avion.ingresos.vuelos_pendientes;
  // Deuda COMPLETA del cliente (venta + otros VuelaTour) cuando supera el
  // pendiente del avión: informativo, para no confundir "lo que falta cobrar"
  // con "lo que falta del avión". Solo si el API ya manda el bruto.
  const pendienteBruto = avion.ingresos.pendiente_bruto_usd;
  const muestraDeudaTotal =
    pendienteBruto != null &&
    pendienteBruto > avion.ingresos.pendiente_cobro_usd;
  const hrefDetalle = hrefRepartoAvion(avion.aeronave.id, { desde, hasta });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={hrefDetalle}
              className="font-mono text-xl font-semibold tracking-tight underline-offset-2 hover:underline"
              title={ETIQUETA_VER_DETALLE_AVION}
            >
              {avion.aeronave.matricula}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {avion.aeronave.modelo}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-muted-foreground">Saldo disponible</p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                positivo
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
              }`}
            >
              {saldo.principal}
            </p>
            {saldo.informativo && (
              <p className="text-xs text-muted-foreground tabular-nums">{saldo.informativo}</p>
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="gap-1">
            <ClockIcon />
            {fmtDecimal(avion.horas_voladas_hr, 1)} hr
          </Badge>
          <Badge
            variant="outline"
            className="gap-1"
            title="Cada vuelo se cuenta una sola vez: un vuelo con varios aviones cuenta en el avión que lo reporta (el principal), aunque su parte de la venta sí está en cada avión del desglose."
          >
            <PaperAirplaneIcon />
            {totalVuelos} vuelo(s) · {avion.ingresos.vuelos_cobrados} cobrados
          </Badge>
          {avion.ingresos.pendiente_cobro_usd > 0 &&
            (enPesos ? (
              <Badge
                variant="outline"
                className={AMBAR}
                title={tituloBadgePendientePesos(avion.ingresos.pendiente_cobro_usd)}
              >
                {textoBadgePendientePesos(
                  {
                    mxn: avion.ingresos.pendiente_cobro_mxn,
                    usd: avion.ingresos.pendiente_cobro_usd,
                  },
                  avion.ingresos.vuelos_pendientes,
                )}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={AMBAR}
                title="Parte del avión pendiente de cobro. Los vuelos se cuentan una sola vez (en el avión que reporta el vuelo)."
              >
                Pendiente {fmtUsd(avion.ingresos.pendiente_cobro_usd)} ·{" "}
                {avion.ingresos.vuelos_pendientes} vuelo(s)
              </Badge>
            ))}
          {muestraDeudaTotal && (
            <span
              className="self-center text-[11px] text-muted-foreground"
              title="Incluye TUAs/extras/pernocta/comisión del vendedor/IVA pendientes (ingresos de VuelaTour, no del avión)."
            >
              {enPesos ? (
                textoDeudaTotalPesos(pendienteBruto)
              ) : (
                <>deuda total del cliente {fmtUsd(pendienteBruto)}</>
              )}
            </span>
          )}
          {avion.gastos.gastos_sin_tc_count > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title={
                enPesos
                  ? tituloGastosSinTcPesos(avion.gastos.gastos_sin_tc_mxn)
                  : `${fmtDecimal(avion.gastos.gastos_sin_tc_mxn)} MXN quedaron fuera del cálculo: sin tipo de cambio capturado ni TC oficial de referencia disponible para su fecha.`
              }
            >
              {avion.gastos.gastos_sin_tc_count} gasto(s) sin TC
            </Badge>
          )}
          {avion.ingresos.cobros_sin_tc_mxn > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title="Cobros en MXN sin tipo de cambio (ni en el cobro, ni en la cotización, ni TC oficial disponible para su fecha): no pudieron convertirse a USD y quedaron fuera del ingreso."
            >
              Cobros sin TC · {fmtDecimal(avion.ingresos.cobros_sin_tc_mxn)} MXN
            </Badge>
          )}
          {/* Otros ingresos del avión en MXN sin T.C. (13-oct-2026): no
              entraron al saldo — se dice, nunca se inventa un T.C. */}
          {(avion.ingresos.otros_ingresos_avion_sin_tc_mxn ?? 0) > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title={enPesos ? TITULO_OTROS_INGRESOS_SIN_TC_PESOS : TITULO_BADGE_OTROS_INGRESOS_SIN_TC}
            >
              {textoBadgeOtrosIngresosSinTc(avion.ingresos.otros_ingresos_avion_sin_tc_mxn ?? 0)}
            </Badge>
          )}
          {/* Informativos (29-ago-2026): lo que SÍ entró con el TC oficial
              de referencia del día. Ya está dentro de las cifras. */}
          {(avion.gastos.gastos_tc_oficial?.count ?? 0) > 0 && (
            <Badge
              variant="outline"
              className={INFO}
              title={`${avion.gastos.gastos_tc_oficial?.count} gasto(s) en MXN sin tipo de cambio capturado (${fmtDecimal(avion.gastos.gastos_tc_oficial?.monto_mxn ?? 0)} MXN) se convirtieron con el TC oficial de referencia del día del gasto (open.er-api / BCE). Ya restan en la cascada; capturar el TC en el gasto lo sustituye.`}
            >
              {avion.gastos.gastos_tc_oficial?.count} gasto(s) con TC oficial
            </Badge>
          )}
          {(avion.ingresos.cobros_tc_oficial_count ?? 0) > 0 && (
            <Badge
              variant="outline"
              className={INFO}
              title="Vuelos cuya cotización no trae tipo de cambio: sus cobros en MXN se convirtieron con el TC oficial de referencia del día de la cotización (open.er-api / BCE). Ya cuentan en la venta cobrada; capturar el TC en el vuelo o en el cobro lo sustituye."
            >
              {avion.ingresos.cobros_tc_oficial_count} vuelo(s) con cobros a TC
              oficial
            </Badge>
          )}
          {(avion.ingresos.otros_ingresos_avion_tc_oficial_count ?? 0) > 0 && (
            <Badge
              variant="outline"
              className={INFO}
              title={TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL}
            >
              {textoBadgeOtrosIngresosTcOficial(
                avion.ingresos.otros_ingresos_avion_tc_oficial_count ?? 0,
              )}
            </Badge>
          )}
          {avion.reparto.length > 0 && avion.reparto_porcentaje_total !== 100 && (
            <Badge variant="outline" className={AMBAR}>
              Socios {fmtDecimal(avion.reparto_porcentaje_total)}% ≠ 100%
            </Badge>
          )}
          {avion.reserva_overhaul_incompleta && (
            <Badge
              variant="outline"
              className={AMBAR}
              title="Hay horas voladas pero la aeronave no tiene tarifa de reserva por hora configurada."
            >
              Reserva sin tarifa
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Cascada del saldo: estas filas suman EXACTO el saldo disponible;
            con la cascada del balance la reserva va debajo, informativa. */}
        <CascadaAvion avion={avion} enPesos={enPesos} comoBalance={comoBalance} compacta />

        <SociosSection
          socios={avion.reparto}
          porcentajeTotal={avion.reparto_porcentaje_total}
          aeronaveId={avion.aeronave.id}
          rol={rol}
          usuarioId={usuarioId}
          enPesos={enPesos}
          comoBalance={comoBalance}
        />

        <CierreRepartoAvion cierre={cierre} matricula={avion.aeronave.matricula} />
      </CardContent>

      <CardFooter className="justify-between gap-2">
        {puedeDescargarBalance ? (
          <ExcelExportButton
            path={`/v1/aircraft/${avion.aeronave.id}/balance.xlsx`}
            query={{ desde, hasta }}
            filename={`balance-${avion.aeronave.matricula}-${desde}-${hasta}.xlsx`}
            label="Balance (Excel)"
          />
        ) : (
          <span />
        )}
        <Link
          href={hrefDetalle}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer gap-1")}
          data-accion="ver-detalle-avion"
        >
          {ETIQUETA_VER_DETALLE_AVION}
          <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  );
}
