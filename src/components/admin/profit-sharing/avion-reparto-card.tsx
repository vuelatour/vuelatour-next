import Link from "next/link";
import {
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { DesgloseSection } from "./desglose-section";
import { CierreRepartoAvion } from "./cierre-reparto-aviso";
import type { CierrePeriodoAditivo } from "@/types/cierres";
import { SociosSection } from "./socios-section";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import {
  NOTA_PAGO_VENDEDOR_REPARTO,
  SUBLABEL_COMISIONES_REPARTO,
} from "@/lib/admin/categorias-gasto";
import {
  ETIQUETA_FILA_OTROS_INGRESOS_AVION,
  SUBLABEL_OTROS_INGRESOS_AVION,
  TITULO_BADGE_OTROS_INGRESOS_SIN_TC,
  TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL,
  textoBadgeOtrosIngresosSinTc,
  textoBadgeOtrosIngresosTcOficial,
  tituloOtrosIngresosAvion,
} from "@/lib/admin/otros-ingresos-avion";
import {
  TITULO_OTROS_INGRESOS_SIN_TC_PESOS,
  avisoPesosSinTc,
  montoPrincipal,
  pesosIncompletos,
  textoBadgePendientePesos,
  textoDeudaTotalPesos,
  textoPorCobrarUsd,
  textoUsd,
  tituloBadgePendientePesos,
  tituloGastosSinTcPesos,
  tituloOtrosIngresosAvionPesos,
  type MontoDoble,
} from "@/lib/admin/reparto-pesos";
import type { AvionReparto } from "@/types/profit-sharing";

const AMBAR =
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
/** Informativo (no advertencia): convertido con el TC oficial de referencia. */
const INFO =
  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30";

/**
 * Card de reparto por avión: cascada del saldo (las filas SUMAN el saldo),
 * reparto a socios, desglose expandible y descarga del balance del avión en
 * Excel. Lo cobrado al cliente por la comisión del vendedor es ingreso de
 * VuelaTour (28-ago-2026); al avión solo le restan, en «Comisiones», su parte
 * de la comisión bancaria (regla sep-2026) y los pagos capturados como
 * «Comisión del vendedor (avión)» (13-oct-2026, API 0.0.74). La fila solo se
 * pinta si el API manda algo que restar.
 *
 * Reparto EN PESOS (18-oct-2026, API 0.0.93): con `enPesos` el saldo, cada
 * fila de la cascada y la utilidad de cada socio pintan los PESOS que manda
 * el API y los dólares debajo, en gris (`montoPrincipal`); la reserva dice
 * su T.C. y, si hubo dólares sin T.C., un aviso ámbar dice que el saldo en
 * pesos está incompleto. Sin la bandera, el marcado de siempre.
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
}) {
  // Pesos (API 0.0.93): solo con la bandera; sin ella, ningún monto cambia.
  const pesos = (
    mxn: number | null | undefined,
    usd: number,
    opts?: { deduccion?: boolean; tc?: number | null },
  ): MontoDoble | undefined => (enPesos ? montoPrincipal({ mxn, usd }, true, opts) : undefined);
  const saldo = montoPrincipal(
    { mxn: avion.saldo_disponible_mxn, usd: avion.saldo_disponible_usd },
    enPesos,
  );
  const positivo = (enPesos ? (saldo.valor ?? avion.saldo_disponible_usd) : avion.saldo_disponible_usd) >= 0;
  const totalVuelos =
    avion.ingresos.vuelos_cobrados + avion.ingresos.vuelos_pendientes;
  const detalle = avion.detalle ?? null;
  // Deuda COMPLETA del cliente (venta + otros VuelaTour) cuando supera el
  // pendiente del avión: informativo, para no confundir "lo que falta cobrar"
  // con "lo que falta del avión". Solo si el API ya manda el bruto.
  const pendienteBruto = avion.ingresos.pendiente_bruto_usd;
  const muestraDeudaTotal =
    pendienteBruto != null &&
    pendienteBruto > avion.ingresos.pendiente_cobro_usd;

  // Sublabel de la reserva: fórmula exacta si el API manda el detalle,
  // si no, al menos las horas voladas que la originan.
  const reservaSub = detalle
    ? `${fmtDecimal(detalle.reserva.horas_hr, 1)} hr × ${fmtUsd(detalle.reserva.tarifa_hora_usd)}/hr`
    : avion.horas_voladas_hr > 0
      ? `${fmtDecimal(avion.horas_voladas_hr, 1)} hr voladas`
      : undefined;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xl font-semibold tracking-tight">
              {avion.aeronave.matricula}
            </p>
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
              {enPesos ? saldo.principal : fmtUsd(avion.saldo_disponible_usd)}
            </p>
            {enPesos && saldo.informativo && (
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
        {/* Cascada del saldo: estas filas suman EXACTO el saldo disponible. */}
        <div className="space-y-1 text-sm">
          <CascadaRow
            label="Venta del avión cobrada"
            value={avion.ingresos.cobrado_usd}
            pesos={pesos(avion.ingresos.cobrado_mxn, avion.ingresos.cobrado_usd)}
            ingreso
          />
          {/* Otros ingresos ASIGNADOS a este avión (13-oct-2026, API
              0.0.75): reembolsos y ventas registrados en Ingresos con el
              avión, netos de comisión. SUMAN al saldo (el API ya los
              incluye); la venta NO se mezcla. Con 0 o un API previo, la
              fila no se pinta y la cascada sigue sumando el saldo. */}
          {(avion.ingresos.otros_ingresos_avion_usd ?? 0) > 0 && (
            <CascadaRow
              label={ETIQUETA_FILA_OTROS_INGRESOS_AVION}
              sublabel={SUBLABEL_OTROS_INGRESOS_AVION}
              value={avion.ingresos.otros_ingresos_avion_usd ?? 0}
              pesos={pesos(
                avion.ingresos.otros_ingresos_avion_mxn,
                avion.ingresos.otros_ingresos_avion_usd ?? 0,
              )}
              title={tituloOtrosIngresosAvion(detalle?.otros_ingresos_avion)}
              tituloPesos={
                enPesos ? tituloOtrosIngresosAvionPesos(detalle?.otros_ingresos_avion) : undefined
              }
              ingreso
            />
          )}
          {/* El avión absorbe su parte de la comisión bancaria de sus cobros
              (regla de septiembre 2026, API 0.0.65) y los pagos capturados
              como «Comisión del vendedor (avión)» (13-oct-2026, API 0.0.74;
              sin pago capturado no resta nada del vendedor).
              `comisiones_venta_usd > 0` también puede venir de un mes
              ANTERIOR a la regla si el avión cargó un pago «(avión)»; con 0
              la fila no se pinta. */}
          {(avion.ingresos.comisiones_venta_usd ?? 0) > 0 && (
            <CascadaRow
              label="Comisiones (banco + vendedor)"
              sublabel={SUBLABEL_COMISIONES_REPARTO}
              value={avion.ingresos.comisiones_venta_usd}
              pesos={pesos(avion.ingresos.comisiones_venta_mxn, avion.ingresos.comisiones_venta_usd, {
                deduccion: true,
              })}
              deduccion
            />
          )}
          <CascadaRow
            label="Gastos directos"
            value={avion.gastos.directos_usd}
            pesos={pesos(avion.gastos.directos_mxn, avion.gastos.directos_usd, { deduccion: true })}
            deduccion
          />
          <CascadaRow
            label="Gastos indirectos"
            value={avion.gastos.indirectos_usd}
            pesos={pesos(avion.gastos.indirectos_mxn, avion.gastos.indirectos_usd, { deduccion: true })}
            deduccion
          />
          <CascadaRow
            label="Permisos"
            value={avion.gastos.permisos_usd}
            pesos={pesos(avion.gastos.permisos_mxn, avion.gastos.permisos_usd, { deduccion: true })}
            deduccion
          />
          <CascadaRow
            label="Fijos (prorrateo + reparto manual)"
            value={avion.gastos.otros_prorrateados_usd}
            pesos={pesos(avion.gastos.otros_prorrateados_mxn, avion.gastos.otros_prorrateados_usd, {
              deduccion: true,
            })}
            deduccion
          />
          <CascadaRow
            label="Reserva overhaul"
            sublabel={reservaSub}
            value={avion.reserva_overhaul_usd}
            pesos={pesos(avion.reserva_overhaul_mxn, avion.reserva_overhaul_usd, {
              deduccion: true,
              tc: detalle?.reserva.tc,
            })}
            deduccion
          />
          {enPesos ? (
            <div className="flex items-start justify-between gap-3 border-t border-border pt-1.5 font-semibold">
              <span>Saldo disponible</span>
              <span className="text-right">
                <span
                  className={`block font-mono tabular-nums ${
                    positivo
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {saldo.principal}
                </span>
                {saldo.informativo && (
                  <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                    {saldo.informativo}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
              <span>Saldo disponible</span>
              <span
                className={`font-mono tabular-nums ${
                  positivo
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {fmtUsd(avion.saldo_disponible_usd)}
              </span>
            </div>
          )}
          {/* Reparto en pesos: dólares que entraron al saldo USD pero no se
              pudieron pasar a pesos (sin ningún T.C.). Se DICE: el saldo en
              pesos está incompleto. */}
          {enPesos && pesosIncompletos(avion) && (
            <p
              data-aviso-pesos-sin-tc=""
              className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs font-normal text-amber-700 dark:text-amber-400"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {avisoPesosSinTc(avion.pesos_sin_tc_usd ?? 0)}
            </p>
          )}
          {/* Informativo (fuera de la cascada): TUAs/extras/pernocta/comisión
              del vendedor/IVA son ingresos de VuelaTour, no del avión — no se
              reparten. Solo si el API ya lo manda. El PAGO al vendedor ya no
              es «egreso de VuelaTour» a secas (13-oct-2026): depende de la
              categoría del gasto real (NOTA_PAGO_VENDEDOR_REPARTO). */}
          {avion.ingresos.otros_ingresos_vuelatour_usd != null && (
            <div
              className="flex items-baseline justify-between gap-3 pt-1 text-xs text-muted-foreground"
              title={`Ingresos de VuelaTour cobrados en vuelos de este avión: TUAs, extras, pernocta y comisión del vendedor (con su IVA). No entran al saldo del avión ni al reparto. ${NOTA_PAGO_VENDEDOR_REPARTO}`}
            >
              <span>
                Otros ingresos VuelaTour (TUAs/extras/pernocta/comisión) — no se
                reparten
                {(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd ?? 0) > 0 && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground/70">
                    {enPesos ? (
                      textoPorCobrarUsd(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd)
                    ) : (
                      <>
                        · por cobrar{" "}
                        {fmtUsd(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd)}
                      </>
                    )}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums">
                {enPesos
                  ? textoUsd(avion.ingresos.otros_ingresos_vuelatour_usd)
                  : fmtUsd(avion.ingresos.otros_ingresos_vuelatour_usd)}
              </span>
            </div>
          )}
        </div>

        <SociosSection
          socios={avion.reparto}
          porcentajeTotal={avion.reparto_porcentaje_total}
          aeronaveId={avion.aeronave.id}
          rol={rol}
          usuarioId={usuarioId}
          enPesos={enPesos}
        />

        <CierreRepartoAvion cierre={cierre} matricula={avion.aeronave.matricula} />

        {detalle && <DesgloseSection detalle={detalle} enPesos={enPesos} />}
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
          href={`/admin/aircraft/${avion.aeronave.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver avión <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}

/**
 * Fila de la cascada. Las deducciones se muestran con signo "−" explícito;
 * el valor viene SIEMPRE positivo del API y aquí solo se pinta.
 */
function CascadaRow({
  label,
  sublabel,
  value,
  pesos,
  title,
  tituloPesos,
  ingreso,
  deduccion,
}: {
  label: string;
  sublabel?: string;
  value: number;
  /** Reparto en pesos: la cifra en pesos (con su «−») y los dólares debajo.
   *  Sin ella, la fila de siempre en dólares. */
  pesos?: MontoDoble;
  /** Tooltip con el detalle (p. ej. los ingresos del avión, uno por renglón). */
  title?: string;
  /** El mismo tooltip con los montos en pesos (solo con `pesos`). */
  tituloPesos?: string;
  ingreso?: boolean;
  deduccion?: boolean;
}) {
  if (pesos) {
    return (
      <div className="flex items-start justify-between gap-3" title={tituloPesos ?? title}>
        <span className="text-muted-foreground">
          {label}
          {sublabel && (
            <span className="ml-1.5 text-[11px] text-muted-foreground/70">
              {sublabel}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span
            className={`block font-mono tabular-nums ${
              ingreso
                ? "text-emerald-600 dark:text-emerald-400"
                : pesos.valor === 0
                  ? "text-muted-foreground"
                  : ""
            }`}
          >
            {pesos.principal}
          </span>
          {pesos.informativo && (
            <span
              className={`block text-xs tabular-nums ${
                pesos.sinPesos
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              }`}
            >
              {pesos.informativo}
            </span>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <span className="text-muted-foreground">
        {label}
        {sublabel && (
          <span className="ml-1.5 text-[11px] text-muted-foreground/70">
            {sublabel}
          </span>
        )}
      </span>
      <span
        className={`font-mono tabular-nums ${
          ingreso
            ? "text-emerald-600 dark:text-emerald-400"
            : value === 0
              ? "text-muted-foreground"
              : ""
        }`}
      >
        {deduccion ? "−" : ""}
        {fmtUsd(value)}
      </span>
    </div>
  );
}
