import Link from "next/link";
import {
  ChevronRightIcon,
  ClockIcon,
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
import { SociosSection } from "./socios-section";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { AvionReparto } from "@/types/profit-sharing";

const AMBAR =
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";

/**
 * Card de reparto por avión: cascada del saldo (las filas SUMAN el saldo),
 * reparto a socios, desglose expandible y descarga del balance del avión en
 * Excel. Desde el 28-ago-2026 la comisión del vendedor NO es costo del avión
 * (es ingreso/egreso de VuelaTour): el API la manda en 0 y la fila solo se
 * pinta si un API previo todavía descuenta algo.
 */
export function AvionRepartoCard({
  avion,
  desde,
  hasta,
  puedeDescargarBalance = true,
}: {
  avion: AvionReparto;
  desde: string;
  hasta: string;
  /** El endpoint del balance es ADMIN/ANALISTA: al SOCIO no se le pinta un
   *  botón que siempre respondería 403. */
  puedeDescargarBalance?: boolean;
}) {
  const positivo = avion.saldo_disponible_usd >= 0;
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
              {fmtUsd(avion.saldo_disponible_usd)}
            </p>
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
          {avion.ingresos.pendiente_cobro_usd > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title="Parte del avión pendiente de cobro. Los vuelos se cuentan una sola vez (en el avión que reporta el vuelo)."
            >
              Pendiente {fmtUsd(avion.ingresos.pendiente_cobro_usd)} ·{" "}
              {avion.ingresos.vuelos_pendientes} vuelo(s)
            </Badge>
          )}
          {muestraDeudaTotal && (
            <span
              className="self-center text-[11px] text-muted-foreground"
              title="Incluye TUAs/extras/pernocta/comisión del vendedor/IVA pendientes (ingresos de VuelaTour, no del avión)."
            >
              deuda total del cliente {fmtUsd(pendienteBruto)}
            </span>
          )}
          {avion.gastos.gastos_sin_tc_count > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title={`${fmtDecimal(avion.gastos.gastos_sin_tc_mxn)} MXN quedaron fuera del cálculo por no tener tipo de cambio.`}
            >
              {avion.gastos.gastos_sin_tc_count} gasto(s) sin TC
            </Badge>
          )}
          {avion.ingresos.cobros_sin_tc_mxn > 0 && (
            <Badge
              variant="outline"
              className={AMBAR}
              title="Cobros en MXN sin tipo de cambio: no pudieron convertirse a USD y quedaron fuera del ingreso."
            >
              Cobros sin TC · {fmtDecimal(avion.ingresos.cobros_sin_tc_mxn)} MXN
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
            ingreso
          />
          {/* Solo con un API previo al 28-ago (hoy siempre 0: la comisión del
              vendedor es ingreso/egreso de VuelaTour, no costo del avión). */}
          {(avion.ingresos.comisiones_venta_usd ?? 0) > 0 && (
            <CascadaRow
              label="Comisiones de venta"
              sublabel="regla anterior — hoy es ingreso/egreso de VuelaTour"
              value={avion.ingresos.comisiones_venta_usd}
              deduccion
            />
          )}
          <CascadaRow
            label="Gastos directos"
            value={avion.gastos.directos_usd}
            deduccion
          />
          <CascadaRow
            label="Gastos indirectos"
            value={avion.gastos.indirectos_usd}
            deduccion
          />
          <CascadaRow
            label="Permisos"
            value={avion.gastos.permisos_usd}
            deduccion
          />
          <CascadaRow
            label="Fijos (prorrateo + reparto manual)"
            value={avion.gastos.otros_prorrateados_usd}
            deduccion
          />
          <CascadaRow
            label="Reserva overhaul"
            sublabel={reservaSub}
            value={avion.reserva_overhaul_usd}
            deduccion
          />
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
          {/* Informativo (fuera de la cascada): TUAs/extras/pernocta/comisión
              del vendedor/IVA son ingresos de VuelaTour, no del avión — no se
              reparten. Solo si el API ya lo manda. */}
          {avion.ingresos.otros_ingresos_vuelatour_usd != null && (
            <div
              className="flex items-baseline justify-between gap-3 pt-1 text-xs text-muted-foreground"
              title="Ingresos de VuelaTour cobrados en vuelos de este avión: TUAs, extras, pernocta y comisión del vendedor (con su IVA). No entran al saldo del avión ni al reparto; la comisión se paga al vendedor desde VuelaTour."
            >
              <span>
                Otros ingresos VuelaTour (TUAs/extras/pernocta/comisión) — no se
                reparten
                {(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd ?? 0) > 0 && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground/70">
                    · por cobrar{" "}
                    {fmtUsd(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd)}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums">
                {fmtUsd(avion.ingresos.otros_ingresos_vuelatour_usd)}
              </span>
            </div>
          )}
        </div>

        <SociosSection
          socios={avion.reparto}
          porcentajeTotal={avion.reparto_porcentaje_total}
          aeronaveId={avion.aeronave.id}
        />

        {detalle && <DesgloseSection detalle={detalle} />}
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
  ingreso,
  deduccion,
}: {
  label: string;
  sublabel?: string;
  value: number;
  ingreso?: boolean;
  deduccion?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
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
