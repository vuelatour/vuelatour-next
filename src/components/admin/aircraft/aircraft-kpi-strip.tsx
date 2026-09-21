import {
  BanknotesIcon,
  CalendarDaysIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";
import {
  CLASE_TONO_SERVICIO,
  dentroDelUmbral,
  estadoOrdenServicio,
  type EstadoServicioUi,
} from "@/lib/admin/proximo-servicio";

/**
 * Strip de KPIs del expediente del avión (patrón de profit-sharing/kpi-strip):
 * lo que el operador necesita a golpe de vista antes de bajar a las cards.
 * Es la CASA única de horas actuales, horas mes/año y próximo servicio (el
 * Resumen operativo no los repite). Dato que el API aún no envíe = "—";
 * nunca se inventa un 0.
 */
export function AircraftKpiStrip({ metrics }: { metrics: AircraftMetricsDetalle }) {
  const u = metrics.utilizacion;
  const prox = metrics.proximo_servicio;
  // Utilidad acumulada: preferimos USD (moneda de operación); si no, la primera.
  const fin =
    metrics.finanzas?.find((f) => f.moneda === "USD") ?? metrics.finanzas?.[0];
  const montoFin = fin
    ? fin.moneda === "MXN"
      ? fmtMxn(fin.utilidad)
      : fmtUsd(fin.utilidad)
    : "—";

  // Tiempo total del planeador: solo si difiere del taco (base histórica
  // capturada); si son iguales el dato no agrega nada.
  const planeador =
    metrics.tiempo_total_planeador != null &&
    metrics.horas_actuales != null &&
    Math.abs(metrics.tiempo_total_planeador - metrics.horas_actuales) > 0.05
      ? metrics.tiempo_total_planeador
      : null;

  // Orden de servicio del próximo hito (19-sep-2026): el KPI ya no se queda
  // en «faltan 9.8 h» — dice si la orden YA existe, si falta ponerle fecha o
  // si el sistema está por crearla. Textos y reglas: lib/admin/proximo-servicio.
  const estadoServicio = estadoOrdenServicio(prox);
  const cercaDelServicio = dentroDelUmbral(prox);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        icon={ClockIcon}
        label="Horas actuales (Hobbs)"
        value={
          metrics.horas_actuales != null
            ? `${fmtDecimal(metrics.horas_actuales, 1)} h`
            : "—"
        }
        hint={
          planeador != null
            ? `Planeador: ${fmtDecimal(planeador, 1)} hrs total`
            : undefined
        }
        mono
      />
      <Kpi
        icon={CalendarDaysIcon}
        label="Horas mes / año"
        value={
          u
            ? `${fmtDecimal(u.horas_mes, 1)} / ${fmtDecimal(u.horas_anio, 1)} h`
            : "—"
        }
        hint={
          u
            ? `${u.vuelos_mes} / ${u.vuelos_anio} vuelos · total ${fmtDecimal(u.horas_total, 1)} h`
            : undefined
        }
      />
      <Kpi
        icon={WrenchScrewdriverIcon}
        label="Próximo servicio"
        value={
          prox
            ? `a las ${fmtDecimal(prox.horas_objetivo, 0)} h`
            : metrics.programa_configurado === false
              ? "Sin programa"
              : "—"
        }
        hint={
          prox
            ? `${prox.titulo} · faltan ${fmtDecimal(prox.faltan_hr, 1)} h`
            : metrics.programa_configurado === false
              ? "Sin vigilancia por horas: configúralo en Tacómetros → Editar programa"
              : undefined
        }
        estado={
          estadoServicio ? <LineaEstadoServicio estado={estadoServicio} /> : undefined
        }
        tooltip={
          prox && (prox.tareas?.length ?? 0) > 0
            ? `Incluye: ${prox.tareas!.join(", ")}`
            : undefined
        }
        valueClass={
          cercaDelServicio
            ? "text-amber-600 dark:text-amber-400"
            : metrics.programa_configurado === false
              ? "text-amber-600 dark:text-amber-400"
              : undefined
        }
      />
      <Kpi
        icon={BanknotesIcon}
        label="Utilidad (acumulada)"
        value={montoFin}
        hint={fin ? "Cobrado − gastos · detalle en Resumen operativo" : undefined}
        valueClass={
          fin
            ? fin.utilidad < 0
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
            : undefined
        }
      />
    </div>
  );
}

/**
 * Segunda línea del KPI «Próximo servicio»: en qué va la ORDEN de servicio.
 * El texto, el tono y el enlace los decide `estadoOrdenServicio` — aquí solo
 * se pintan (fuente única, para que la card de tacómetros diga lo mismo).
 */
function LineaEstadoServicio({ estado }: { estado: EstadoServicioUi }) {
  return (
    <p
      className={`mt-0.5 text-[11px] font-medium ${CLASE_TONO_SERVICIO[estado.tono]}`}
      title={estado.detalle}
    >
      {estado.texto}
      {estado.accion && (
        <>
          {" · "}
          <a
            href={estado.accion.href}
            className="underline underline-offset-2 hover:no-underline"
          >
            {estado.accion.texto}
          </a>
        </>
      )}
    </p>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  estado,
  tooltip,
  valueClass,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  /** Línea extra BAJO el hint (estado de la orden de servicio): puede llevar enlace. */
  estado?: React.ReactNode;
  /** Tooltip nativo del card completo (detalle largo, ej. checklist del servicio). */
  tooltip?: string;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <Card size="sm" title={tooltip}>
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p
            className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${
              mono ? "font-mono" : ""
            } ${valueClass ?? ""}`}
          >
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {hint}
            </p>
          )}
          {estado}
        </div>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
      </CardContent>
    </Card>
  );
}
