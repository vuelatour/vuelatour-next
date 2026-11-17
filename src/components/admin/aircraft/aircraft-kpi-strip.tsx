import { CalendarDaysIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDecimal } from "@/lib/format";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";
import {
  ROTULO_HORAS_MES,
  hintVuelosYTotal,
  rotuloHorasAcumuladas,
  textoVuelos,
} from "@/lib/admin/inicio-oficial";

/**
 * Franja de KPIs del expediente del avión (patrón de profit-sharing/kpi-strip).
 *
 * Desde el 17-nov-2026 trae SOLO lo que no se repite en una card de abajo
 * (pedido del cliente: «si el dato ya aparece en otro componente más abajo
 * vamos a omitirlo arriba»): la UTILIZACIÓN, en dos tarjetas. Lo que se fue:
 *  - Horas actuales (Hobbs) ⇒ vive en Mantenimiento → «Horas y programa».
 *  - Próximo servicio ⇒ vive en el resumen de Mantenimiento.
 *  - Utilidad / Gastos ⇒ vive en «Resumen operativo».
 * Sin `metrics.utilizacion` la franja no se pinta (nunca se inventa un 0).
 */
export function AircraftKpiStrip({ metrics }: { metrics: AircraftMetricsDetalle }) {
  const u = metrics.utilizacion;
  if (!u) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-kpi="utilizacion">
      <Kpi
        icon={ClockIcon}
        label={ROTULO_HORAS_MES}
        value={`${fmtDecimal(u.horas_mes, 1)} h`}
        hint={textoVuelos(u.vuelos_mes)}
      />
      <Kpi
        icon={CalendarDaysIcon}
        // API 0.0.85: con `anio_desde` el «año» cuenta desde el inicio
        // oficial («Horas desde el 01/09/2026»); sin la llave, «este año».
        label={rotuloHorasAcumuladas(metrics.anio_desde)}
        value={`${fmtDecimal(u.horas_anio, 1)} h`}
        hint={hintVuelosYTotal(u.vuelos_anio, `${fmtDecimal(u.horas_total, 1)} h`)}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
          )}
        </div>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
      </CardContent>
    </Card>
  );
}
