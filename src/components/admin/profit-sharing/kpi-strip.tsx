import {
  ArrowTrendingDownIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  ClockIcon,
  ScaleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { NOTA_PAGO_VENDEDOR_REPARTO } from "@/lib/admin/categorias-gasto";
import { hintKpiOtrosIngresosAviones } from "@/lib/admin/otros-ingresos-avion";
import { TEXTO_RESERVA_NO_RESTA } from "@/lib/admin/reparto-avion";
import {
  HINT_SALDO_PESOS_INCOMPLETO,
  TITULO_SALDO_PESOS_INCOMPLETO,
  combustibleSeparado,
  gastosMxnDeAvion,
  hintKpiGastosPeriodo,
  hintKpiOtrosIngresosAvionesPesos,
  hintKpiOtrosVuelatourPesos,
  montoPrincipal,
  pesosIncompletos,
  textoUsd,
  totalFlotaMxn,
} from "@/lib/admin/reparto-pesos";
import type {
  AvionReparto,
  OtrosIngresosVuelatour,
} from "@/types/profit-sharing";

/**
 * Strip de KPIs de la flota para el reparto: totales del periodo a golpe de
 * vista antes de bajar al detalle por avión. Se calcula sumando las mismas
 * cifras que muestran las cards (ninguna fuente paralela). Los conteos de
 * vuelos cobrados/pendientes suman vuelos DISTINTOS: el API cuenta cada
 * vuelo una sola vez (en el avión que lo reporta) aunque lo hayan volado
 * varios aviones. `otrosIngresos` (TUAs/extras/pernocta/comisión del
 * vendedor/IVA de VuelaTour) es informativo y opcional: el API previo al
 * deploy no lo manda.
 *
 * Reparto EN PESOS (18-oct-2026, API 0.0.93): con `enPesos` cada KPI pinta
 * los pesos (Σ en centavos de los `*_mxn` de las cards) y los dólares debajo
 * como dato informativo (`montoPrincipal`); sin la bandera, lo de siempre.
 * «Otros ingresos VuelaTour» sigue en dólares (no se reparte) con su sufijo.
 */
export function KpiStrip({
  aviones,
  otrosIngresos = null,
  enPesos = false,
  comoBalance = false,
}: {
  aviones: AvionReparto[];
  otrosIngresos?: OtrosIngresosVuelatour | null;
  /** Bandera raíz `reparto_en_pesos` del API (`repartoEnPesos`). */
  enPesos?: boolean;
  /** Bandera raíz `reparto_como_balance` (API 0.0.101): la provisión AFAC
   *  cuenta en «Gastos del periodo» y la reserva es solo informativa. */
  comoBalance?: boolean;
}) {
  const sum = (fn: (a: AvionReparto) => number) =>
    aviones.reduce((acc, a) => acc + fn(a), 0);

  const ingresos = sum((a) => a.ingresos.cobrado_usd);
  // Otros ingresos ASIGNADOS a los aviones (13-oct-2026, API 0.0.75): ya
  // están dentro del saldo de cada avión. La cifra de VENTA no se mezcla:
  // van en el hint para que Venta + Otros − Gastos − Reserva = Saldo se lea.
  const otrosAvion = sum((a) => a.ingresos.otros_ingresos_avion_usd ?? 0);
  // Misma cascada que la card: comisiones_venta_usd trae la parte del avión
  // de la comisión bancaria (regla de septiembre 2026, API 0.0.65) + los
  // pagos «Comisión del vendedor (avión)» (13-oct-2026, API 0.0.74); vale 0
  // si no hay nada que restar. Con la cascada del balance (API 0.0.101) la
  // provisión AFAC también es un gasto del periodo. Con el combustible
  // separado (API 0.0.103) `directos_usd` ya no lo trae: se suma aparte.
  const gastos = sum(
    (a) =>
      (a.ingresos.comisiones_venta_usd ?? 0) +
      a.gastos.directos_usd +
      (a.gastos.combustible_usd ?? 0) +
      a.gastos.indirectos_usd +
      a.gastos.permisos_usd +
      a.gastos.otros_prorrateados_usd +
      (comoBalance ? (a.afac_reservado_usd ?? 0) : 0),
  );
  const conCombustible = aviones.some(combustibleSeparado);
  // Desglose de otros ingresos para el tooltip (la comisión solo si el API
  // ya la manda). En pesos, los dólares llevan su sufijo.
  const usdOtros = enPesos ? textoUsd : fmtUsd;
  const d = otrosIngresos?.desglose;
  const otrosDesglose = d
    ? [
        `TUAs ${usdOtros(d.tuas_usd)}`,
        `extras ${usdOtros(d.extras_usd)}`,
        `pernocta ${usdOtros(d.pernocta_usd)}`,
        ...(d.comision_usd != null
          ? [`comisión vendedor ${usdOtros(d.comision_usd)}`]
          : []),
        `IVA ${usdOtros(d.iva_usd)}`,
      ].join(" · ")
    : undefined;
  const reserva = sum((a) => a.reserva_overhaul_usd);
  const pendiente = sum((a) => a.ingresos.pendiente_cobro_usd);
  const vuelosPendientes = sum((a) => a.ingresos.vuelos_pendientes);
  const vuelosCobrados = sum((a) => a.ingresos.vuelos_cobrados);
  const saldo = sum((a) => a.saldo_disponible_usd);
  const horas = sum((a) => a.horas_voladas_hr);
  // Pesos (API 0.0.93): solo SUMA lo que ya trae cada card, en centavos; si a
  // algún avión le falta la llave, el KPI cae a los dólares y lo dice.
  const mxn = (llave: (a: AvionReparto) => number | null | undefined) =>
    enPesos ? totalFlotaMxn(aviones, llave) : null;
  const venta = montoPrincipal({ mxn: mxn((a) => a.ingresos.cobrado_mxn), usd: ingresos }, enPesos);
  const gastosKpi = montoPrincipal(
    { mxn: mxn((a) => gastosMxnDeAvion(a, { conAfac: comoBalance })), usd: gastos },
    enPesos,
  );
  const reservaKpi = montoPrincipal({ mxn: mxn((a) => a.reserva_overhaul_mxn), usd: reserva }, enPesos);
  const pendienteKpi = montoPrincipal(
    { mxn: mxn((a) => a.ingresos.pendiente_cobro_mxn), usd: pendiente },
    enPesos,
  );
  const saldoKpi = montoPrincipal({ mxn: mxn((a) => a.saldo_disponible_mxn), usd: saldo }, enPesos);
  const saldoPositivo = (saldoKpi.valor ?? saldo) >= 0;
  const otrosAvionMxn = mxn((a) => a.ingresos.otros_ingresos_avion_mxn ?? 0);
  const hintVenta =
    enPesos && otrosAvionMxn !== null
      ? `${vuelosCobrados} vuelo(s) cobrados${hintKpiOtrosIngresosAvionesPesos(otrosAvionMxn)}`
      : `${vuelosCobrados} vuelo(s) cobrados${hintKpiOtrosIngresosAviones(otrosAvion)}`;
  const tieneOtrosAvion = enPesos && otrosAvionMxn !== null ? otrosAvionMxn > 0 : otrosAvion > 0;
  const saldoIncompleto = enPesos && aviones.some(pesosIncompletos);
  // 5 KPIs base + 1 informativo si viene el bloque; con cuenta impar el
  // último ocupa las 2 columnas del grid móvil para no dejar hueco.
  const conOtros = otrosIngresos != null;
  const ultimoAncho = conOtros ? undefined : "col-span-2 md:col-span-1";

  return (
    <div
      className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${conOtros ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}
    >
      <Kpi
        icon={BanknotesIcon}
        label="Venta de aviones cobrada"
        value={venta.principal}
        informativo={venta.informativo}
        hint={hintVenta}
        // El hint se trunca en tarjetas angostas: completo en el tooltip.
        title={tieneOtrosAvion ? hintVenta : undefined}
        valueClass="text-emerald-600 dark:text-emerald-400"
      />
      <Kpi
        icon={ArrowTrendingDownIcon}
        label="Gastos del periodo"
        value={gastosKpi.principal}
        informativo={gastosKpi.informativo}
        hint={hintKpiGastosPeriodo({ comoBalance, conCombustible })}
      />
      <Kpi
        icon={WrenchScrewdriverIcon}
        label={comoBalance ? "Reserva a guardar" : "Reserva overhaul"}
        value={reservaKpi.principal}
        informativo={reservaKpi.informativo}
        hint={comoBalance ? `no se resta · ${fmtDecimal(horas, 1)} hr voladas` : `${fmtDecimal(horas, 1)} hr voladas`}
        title={comoBalance ? TEXTO_RESERVA_NO_RESTA : undefined}
      />
      <Kpi
        icon={ClockIcon}
        label="Pendiente de cobro"
        value={pendienteKpi.principal}
        informativo={pendienteKpi.informativo}
        hint={`${vuelosPendientes} vuelo(s) sin cobrar`}
        valueClass={
          pendiente > 0 ? "text-amber-600 dark:text-amber-400" : undefined
        }
      />
      <Kpi
        icon={ScaleIcon}
        label="Saldo disponible total"
        value={saldoKpi.principal}
        informativo={saldoKpi.informativo}
        hint={saldoIncompleto ? HINT_SALDO_PESOS_INCOMPLETO : "A repartir entre socios"}
        title={saldoIncompleto ? TITULO_SALDO_PESOS_INCOMPLETO : undefined}
        valueClass={
          saldoPositivo
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive"
        }
        className={ultimoAncho}
      />
      {conOtros && (
        <Kpi
          icon={BuildingOfficeIcon}
          label="Otros ingresos VuelaTour"
          value={enPesos ? textoUsd(otrosIngresos.cobrado_usd) : fmtUsd(otrosIngresos.cobrado_usd)}
          hint={
            enPesos
              ? hintKpiOtrosVuelatourPesos(otrosIngresos.pendiente_usd)
              : otrosIngresos.pendiente_usd > 0
                ? `TUAs/extras/pernocta/comisión · no se reparten · por cobrar ${fmtUsd(otrosIngresos.pendiente_usd)}`
                : "TUAs/extras/pernocta/comisión · no se reparten"
          }
          title={
            otrosDesglose
              ? `Ingresos de VuelaTour (no de los aviones): ${otrosDesglose}. ${NOTA_PAGO_VENDEDOR_REPARTO}`
              : undefined
          }
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  informativo,
  hint,
  title,
  valueClass,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Dato informativo bajo la cifra (los dólares del reparto en pesos). */
  informativo?: string | null;
  hint?: string;
  /** Tooltip nativo con el detalle largo (el hint se trunca). */
  title?: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <Card size="sm" className={className} title={title}>
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p
            className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${valueClass ?? ""}`}
          >
            {value}
          </p>
          {informativo && (
            <p className="text-xs text-muted-foreground tabular-nums">{informativo}</p>
          )}
          {hint && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
      </CardContent>
    </Card>
  );
}
