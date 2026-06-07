import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtDecimal } from "@/lib/format";
import type { AircraftMetrics } from "@/types/aircraft";

function money(n: number, moneda: string): string {
  return `${new Intl.NumberFormat("en-US", { style: "currency", currency: moneda === "MXN" ? "MXN" : "USD", maximumFractionDigits: 0 }).format(n)}`;
}

export function AircraftMetricsCard({ metrics }: { metrics: AircraftMetrics }) {
  const { airworthiness: aw, utilizacion: u, finanzas } = metrics;

  const razones: string[] = [];
  if (aw.en_taller) razones.push("Servicio en taller");
  for (const d of aw.documentos_vencidos) razones.push(`Documento vencido: ${d.tipo_nombre}`);
  for (const c of aw.componentes_vencidos)
    razones.push(`TBO agotado: ${c.posicion} (${c.numero_serie})`);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Resumen operativo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Semáforo apto para volar */}
        <div
          className={`rounded-lg border p-4 ${
            aw.apto
              ? "border-green-500/30 bg-green-500/10"
              : "border-destructive/30 bg-destructive/10"
          }`}
        >
          <div className="flex items-center gap-2">
            {aw.apto ? (
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />
            )}
            <p
              className={`text-sm font-semibold ${
                aw.apto ? "text-green-600 dark:text-green-400" : "text-destructive"
              }`}
            >
              {aw.apto ? "Apto para volar" : "No apto para volar"}
            </p>
          </div>
          {!aw.apto && (
            <ul className="mt-2 ml-7 list-disc text-xs text-destructive space-y-0.5">
              {razones.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Utilización */}
        <div>
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
            <ClockIcon className="h-3.5 w-3.5" />
            Utilización (horas voladas · vuelos)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Mes" value={`${fmtDecimal(u.horas_mes)} h`} sub={`${u.vuelos_mes} vuelos`} />
            <Stat label="Año" value={`${fmtDecimal(u.horas_anio)} h`} sub={`${u.vuelos_anio} vuelos`} />
            <Stat label="Total" value={`${fmtDecimal(u.horas_total)} h`} sub={`${u.vuelos_total} vuelos`} />
          </div>
        </div>

        {/* Finanzas */}
        <div>
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
            <BanknotesIcon className="h-3.5 w-3.5" />
            Cobrado vs gastos (acumulado)
          </p>
          {finanzas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {finanzas.map((f) => (
                <div
                  key={f.moneda}
                  className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm"
                >
                  <span className="font-mono font-semibold">{f.moneda}</span>
                  <Mini label="Cobrado" value={money(f.ingresos, f.moneda)} />
                  <Mini label="Gastos" value={money(f.gastos, f.moneda)} />
                  <Mini
                    label="Utilidad"
                    value={money(f.utilidad, f.moneda)}
                    className={f.utilidad < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Acumulado simple por moneda (solo lo cobrado). El reparto formal por socio lo maneja
            el cierre mensual.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Mini({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-medium ${className}`}>{value}</p>
    </div>
  );
}
