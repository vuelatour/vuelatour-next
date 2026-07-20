import Link from "next/link";
import {
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMxn, fmtUsd } from "@/lib/format";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";

/** Monto en la moneda del renglón vía los formateadores únicos de @/lib/format. */
function monto(n: number, moneda: string): string {
  return moneda === "MXN" ? fmtMxn(n) : fmtUsd(n);
}

/**
 * Razones de no-apto. Fuente ÚNICA para esta card y para el badge del header
 * del expediente. Prefiere las razones redactadas por el API (contrato nuevo,
 * ya incluyen discrepancias ALTA); si aún no vienen, se arman del desglose.
 */
export function razonesNoApto(
  aw: AircraftMetricsDetalle["airworthiness"],
): string[] {
  if (aw.razones && aw.razones.length > 0) return aw.razones;
  const razones: string[] = [];
  if (aw.en_taller) razones.push("Servicio en taller");
  for (const d of aw.documentos_vencidos)
    razones.push(`Documento vencido: ${d.tipo_nombre}`);
  for (const c of aw.componentes_vencidos)
    razones.push(`TBO agotado: ${c.posicion} (${c.numero_serie})`);
  for (const q of aw.discrepancias_altas ?? [])
    razones.push(`Discrepancia ALTA abierta: ${q.descripcion}`);
  return razones;
}

/**
 * Resumen operativo: semáforo apto-para-volar + cobrado vs gastos. Las horas
 * (actuales, mes/año, próximo servicio) viven en el KPI strip de arriba —
 * aquí no se repiten para que cada dato tenga una sola casa.
 */
export function AircraftMetricsCard({
  metrics,
  aircraftId,
}: {
  metrics: AircraftMetricsDetalle;
  aircraftId: string;
}) {
  const { airworthiness: aw, finanzas } = metrics;
  const razones = razonesNoApto(aw);

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
          {!aw.apto && razones.length > 0 && (
            <ul className="mt-2 ml-7 space-y-1 text-xs text-destructive">
              {razones.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <XCircleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
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
                  <Mini label="Cobrado" value={monto(f.ingresos, f.moneda)} />
                  <div>
                    <p className="text-[11px] text-muted-foreground">Gastos</p>
                    <Link
                      href={`/admin/expenses?aeronave_id=${aircraftId}`}
                      className="font-medium underline decoration-dotted underline-offset-2 hover:text-foreground"
                      title="Ver los gastos de esta aeronave"
                    >
                      {monto(f.gastos, f.moneda)}
                    </Link>
                  </div>
                  <Mini
                    label="Utilidad"
                    value={monto(f.utilidad, f.moneda)}
                    className={
                      f.utilidad < 0
                        ? "text-destructive"
                        : "text-green-600 dark:text-green-400"
                    }
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
