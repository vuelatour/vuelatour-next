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
 */
export function KpiStrip({
  aviones,
  otrosIngresos = null,
}: {
  aviones: AvionReparto[];
  otrosIngresos?: OtrosIngresosVuelatour | null;
}) {
  const sum = (fn: (a: AvionReparto) => number) =>
    aviones.reduce((acc, a) => acc + fn(a), 0);

  const ingresos = sum((a) => a.ingresos.cobrado_usd);
  // Misma cascada que la card: desde el 28-ago-2026 comisiones_venta_usd es
  // SIEMPRE 0 (la comisión del vendedor es ingreso/egreso de VuelaTour, no
  // costo del avión); se suma solo para seguir cuadrando con un API previo.
  const gastos = sum(
    (a) =>
      (a.ingresos.comisiones_venta_usd ?? 0) +
      a.gastos.directos_usd +
      a.gastos.indirectos_usd +
      a.gastos.permisos_usd +
      a.gastos.otros_prorrateados_usd,
  );
  // Desglose de otros ingresos para el tooltip (la comisión solo si el API
  // ya la manda).
  const d = otrosIngresos?.desglose;
  const otrosDesglose = d
    ? [
        `TUAs ${fmtUsd(d.tuas_usd)}`,
        `extras ${fmtUsd(d.extras_usd)}`,
        `pernocta ${fmtUsd(d.pernocta_usd)}`,
        ...(d.comision_usd != null
          ? [`comisión vendedor ${fmtUsd(d.comision_usd)}`]
          : []),
        `IVA ${fmtUsd(d.iva_usd)}`,
      ].join(" · ")
    : undefined;
  const reserva = sum((a) => a.reserva_overhaul_usd);
  const pendiente = sum((a) => a.ingresos.pendiente_cobro_usd);
  const vuelosPendientes = sum((a) => a.ingresos.vuelos_pendientes);
  const vuelosCobrados = sum((a) => a.ingresos.vuelos_cobrados);
  const saldo = sum((a) => a.saldo_disponible_usd);
  const horas = sum((a) => a.horas_voladas_hr);
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
        value={fmtUsd(ingresos)}
        hint={`${vuelosCobrados} vuelo(s) cobrados`}
        valueClass="text-emerald-600 dark:text-emerald-400"
      />
      <Kpi
        icon={ArrowTrendingDownIcon}
        label="Gastos del periodo"
        value={fmtUsd(gastos)}
        hint="Directos, indirectos, permisos y fijos"
      />
      <Kpi
        icon={WrenchScrewdriverIcon}
        label="Reserva overhaul"
        value={fmtUsd(reserva)}
        hint={`${fmtDecimal(horas, 1)} hr voladas`}
      />
      <Kpi
        icon={ClockIcon}
        label="Pendiente de cobro"
        value={fmtUsd(pendiente)}
        hint={`${vuelosPendientes} vuelo(s) sin cobrar`}
        valueClass={
          pendiente > 0 ? "text-amber-600 dark:text-amber-400" : undefined
        }
      />
      <Kpi
        icon={ScaleIcon}
        label="Saldo disponible total"
        value={fmtUsd(saldo)}
        hint="A repartir entre socios"
        valueClass={
          saldo >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive"
        }
        className={ultimoAncho}
      />
      {conOtros && (
        <Kpi
          icon={BuildingOfficeIcon}
          label="Otros ingresos VuelaTour"
          value={fmtUsd(otrosIngresos.cobrado_usd)}
          hint={
            otrosIngresos.pendiente_usd > 0
              ? `TUAs/extras/pernocta/comisión · no se reparten · por cobrar ${fmtUsd(otrosIngresos.pendiente_usd)}`
              : "TUAs/extras/pernocta/comisión · no se reparten"
          }
          title={
            otrosDesglose
              ? `Ingresos de VuelaTour (no de los aviones): ${otrosDesglose}. La comisión del vendedor es ingreso de VuelaTour y su pago al vendedor, egreso de VuelaTour (Otros movimientos).`
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
  hint,
  title,
  valueClass,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
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
