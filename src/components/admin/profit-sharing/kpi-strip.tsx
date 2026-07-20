import {
  ArrowTrendingDownIcon,
  BanknotesIcon,
  ClockIcon,
  ScaleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { AvionReparto } from "@/types/profit-sharing";

/**
 * Strip de KPIs de la flota para el reparto: totales del periodo a golpe de
 * vista antes de bajar al detalle por avión. Se calcula sumando las mismas
 * cifras que muestran las cards (ninguna fuente paralela).
 */
export function KpiStrip({ aviones }: { aviones: AvionReparto[] }) {
  const sum = (fn: (a: AvionReparto) => number) =>
    aviones.reduce((acc, a) => acc + fn(a), 0);

  const ingresos = sum((a) => a.ingresos.cobrado_usd);
  const gastos = sum(
    (a) =>
      a.ingresos.comisiones_venta_usd +
      a.gastos.directos_usd +
      a.gastos.indirectos_usd +
      a.gastos.permisos_usd +
      a.gastos.otros_prorrateados_usd,
  );
  const reserva = sum((a) => a.reserva_overhaul_usd);
  const pendiente = sum((a) => a.ingresos.pendiente_cobro_usd);
  const vuelosPendientes = sum((a) => a.ingresos.vuelos_pendientes);
  const vuelosCobrados = sum((a) => a.ingresos.vuelos_cobrados);
  const saldo = sum((a) => a.saldo_disponible_usd);
  const horas = sum((a) => a.horas_voladas_hr);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icon={BanknotesIcon}
        label="Ingresos cobrados"
        value={fmtUsd(ingresos)}
        hint={`${vuelosCobrados} vuelo(s) cobrados`}
        valueClass="text-emerald-600 dark:text-emerald-400"
      />
      <Kpi
        icon={ArrowTrendingDownIcon}
        label="Gastos del periodo"
        value={fmtUsd(gastos)}
        hint="Incluye comisiones de venta"
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
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  valueClass,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
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
