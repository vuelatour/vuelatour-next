import { notFound } from "next/navigation";
import {
  CogIcon,
  CpuChipIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AircraftImagesCard } from "@/components/admin/aircraft/aircraft-images-card";
import { AircraftEngineering } from "@/components/admin/aircraft/aircraft-engineering";
import { AircraftEditButton } from "@/components/admin/aircraft/aircraft-edit-button";
import { AircraftFlightsCard } from "@/components/admin/aircraft/aircraft-flights-card";
import {
  AircraftOwnersCard,
  type SocioOption,
} from "@/components/admin/aircraft/aircraft-owners-card";
import { AircraftEngineButton } from "@/components/admin/aircraft/aircraft-engine-button";
import { AircraftPropellerButton } from "@/components/admin/aircraft/aircraft-propeller-button";
import { AircraftInsuranceCard } from "@/components/admin/aircraft/aircraft-insurance-card";
import {
  AircraftMetricsCard,
  razonesNoApto,
} from "@/components/admin/aircraft/aircraft-metrics-card";
import { AircraftKpiStrip } from "@/components/admin/aircraft/aircraft-kpi-strip";
import { AircraftTacometrosCard } from "@/components/admin/aircraft/aircraft-tacometros-card";
import { AircraftSquawksCard } from "@/components/admin/aircraft/aircraft-squawks-card";
import { ErrorState } from "@/components/admin/error-state";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import {
  getAircraftMetrics,
  getAircraftSnapshot,
  type AircraftMetricsDetalle,
} from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { Motor, OverhaulReserve, Propeller } from "@/types/aircraft";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AircraftDetailPage({ params }: PageProps) {
  const { id } = await params;

  let aircraft;
  try {
    aircraft = await getAircraftSnapshot(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const motorsSorted = [...aircraft.motors].sort(motorOrden);
  const propsSorted = [...aircraft.propellers].sort(propellerOrden);
  const reservesByMotor = new Map(aircraft.overhaul_reserves.map((r) => [r.motor_id, r]));

  // Socios candidatos para asignar como propietarios. Best-effort: si falla,
  // la tarjeta sigue funcionando para editar/cerrar los existentes.
  let socios: SocioOption[] = [];
  try {
    const u = await listUsers({ estado: "ACTIVO", limit: 200 });
    socios = u.data.map((x) => ({ id: x.id, nombre: x.nombre }));
  } catch {
    socios = [];
  }

  // Métricas operativas (apto-para-volar, utilización, finanzas).
  // 403 = rol sin permiso: se ocultan en silencio (comportamiento de siempre).
  // CUALQUIER otra falla se pinta con ErrorState — nunca disfrazar una caída
  // del API de "sin datos" (regla de fiabilidad del cierre).
  let metrics: AircraftMetricsDetalle | null = null;
  let metricsError = false;
  try {
    metrics = await getAircraftMetrics(id);
  } catch (err) {
    if (!(isApiError(err) && err.status === 403)) metricsError = true;
  }

  const razones = metrics ? razonesNoApto(metrics.airworthiness) : [];

  return (
    <div className="space-y-6">
      <div>
        <BackLink
          href="/admin/aircraft"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          Volver a la flota
        </BackLink>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl md:text-3xl font-mono font-semibold tracking-tight">
              {aircraft.matricula}
            </h1>
            <p className="text-base text-muted-foreground">
              {aircraft.modelo} · Base {aircraft.ubicacion_base}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="font-mono">
                {aircraft.pais_registro}
              </Badge>
              {!aircraft.activa && <Badge variant="secondary">Inactiva</Badge>}
              {metrics?.en_vuelo && (
                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20">
                  En vuelo ahora
                </Badge>
              )}
              {metrics &&
                (metrics.airworthiness.apto ? (
                  <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                    Apto para volar
                  </Badge>
                ) : (
                  <Badge
                    className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-help"
                    title={razones.join("\n")}
                  >
                    No apto
                  </Badge>
                ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton
              path={`/v1/aircraft/${aircraft.id}/balance.xlsx`}
              filename={`balance-${aircraft.matricula}.xlsx`}
              label="Balance (Excel)"
            />
            <AircraftEditButton aircraft={aircraft} />
          </div>
        </div>
      </div>

      {/* KPI strip: horas actuales, mes/año, próximo servicio, utilidad. */}
      {metrics && <AircraftKpiStrip metrics={metrics} />}

      {/* Expediente en columna única, ordenado por prioridad del operador:
          lo operativo (semáforo, tacos, discrepancias, viajes) arriba; la
          ficha técnica y lo administrativo después. */}
      <div className="space-y-6">
        {/* 1. Resumen operativo (semáforo apto-para-volar + finanzas) */}
        {metricsError ? (
          <ErrorState
            title="No se pudo cargar el resumen operativo"
            description="El resto del expediente sigue disponible. Recarga la página; si el problema persiste, avisa al administrador."
          />
        ) : (
          metrics && <AircraftMetricsCard metrics={metrics} aircraftId={aircraft.id} />
        )}

        {/* 2. Tacómetros: histórico por aeronave + programa de servicio por horas */}
        <AircraftTacometrosCard
          aircraftId={aircraft.id}
          intervalos={aircraft.servicio_intervalos ?? []}
          horasBase={aircraft.servicio_horas_base ?? 0}
        />

        {/* 3. Bitácora de discrepancias (squawks) */}
        <AircraftSquawksCard aircraftId={aircraft.id} discrepancias={aircraft.discrepancias} />

        {/* 4. Viajes: historial de vuelos de esta aeronave */}
        <AircraftFlightsCard aircraftId={aircraft.id} />

        {/* 5. Ingeniería aeronáutica: mantenimientos, permisos, servicios próximos */}
        <AircraftEngineering aircraftId={aircraft.id} />

        {/* 6. Especificaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CogIcon className="h-4 w-4 text-muted-foreground" />
              Especificaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Field label="Velocidad crucero" value={`${fmtDecimal(aircraft.velocidad_crucero_kts, 0)} kts`} />
              <Field label="Motores" value={String(aircraft.num_motores)} />
              <Field label="Asientos" value={String(aircraft.asientos)} />
              <Field label="Base" value={aircraft.ubicacion_base} />
              <Field label="Tarifa público" value={`${fmtUsd(aircraft.tarifa_hora_pub_usd)} / hr`} />
              <Field label="Tarifa broker" value={`${fmtUsd(aircraft.tarifa_hora_broker_usd)} / hr`} />
              <Field
                label="Reserva overhaul"
                value={`${fmtUsd(aircraft.reserva_overhaul_hr_usd)} / hr`}
              />
              <Field
                label="Aportación AFAC"
                value={
                  aircraft.permiso_afac_usd_hr != null &&
                  aircraft.permiso_afac_usd_hr !== "" &&
                  Number(aircraft.permiso_afac_usd_hr) > 0
                    ? `${fmtUsd(aircraft.permiso_afac_usd_hr)} / hr cobrada`
                    : "No aplica"
                }
              />
              {aircraft.color_calendario && (
                <div>
                  <dt className="text-muted-foreground text-xs">Color calendario</dt>
                  <dd className="flex items-center gap-2 font-medium mt-0.5">
                    <span
                      className="inline-block h-4 w-4 rounded border border-border"
                      style={{ backgroundColor: aircraft.color_calendario }}
                    />
                    <span className="font-mono text-xs">{aircraft.color_calendario}</span>
                  </dd>
                </div>
              )}
            </dl>
            {aircraft.notas && (
              <p className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
                {aircraft.notas}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 7. Imágenes */}
        <AircraftImagesCard
          aircraftId={aircraft.id}
          matricula={aircraft.matricula}
          imagenes={aircraft.imagenes}
        />

        {/* 8-9. Propietarios y Seguros: cards angostas, emparejadas en desktop */}
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:!col-span-1">
          <AircraftOwnersCard
            aircraftId={aircraft.id}
            owners={aircraft.owners}
            socios={socios}
          />
          <AircraftInsuranceCard aircraftId={aircraft.id} seguros={aircraft.seguros} />
        </div>

        {/* 10. Motores */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <CpuChipIcon className="h-4 w-4 text-muted-foreground" />
                Motores
              </CardTitle>
              <CardDescription>{motorsSorted.length} unidades</CardDescription>
            </div>
            <AircraftEngineButton aircraftId={aircraft.id} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {motorsSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin motores registrados.</p>
            ) : (
              motorsSorted.map((m) => (
                <MotorCard
                  key={m.id}
                  motor={m}
                  reserve={reservesByMotor.get(m.id)}
                  aircraftId={aircraft.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 11. Hélices */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <CogIcon className="h-4 w-4 text-muted-foreground" />
                Hélices
              </CardTitle>
              <CardDescription>{propsSorted.length} unidades</CardDescription>
            </div>
            <AircraftPropellerButton aircraftId={aircraft.id} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {propsSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin hélices registradas.</p>
            ) : (
              propsSorted.map((p) => (
                <PropellerCard key={p.id} propeller={p} aircraftId={aircraft.id} />
              ))
            )}
          </CardContent>
        </Card>

        {/* 12. Reservas overhaul (resumen) */}
        {aircraft.overhaul_reserves.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
                Reservas overhaul
              </CardTitle>
              <CardDescription>
                Acumulado por motor según horas voladas × tarifa.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aircraft.overhaul_reserves.map((r) => (
                <ReserveCard key={r.id} reserve={r} motors={aircraft.motors} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium mt-0.5">{value}</dd>
    </div>
  );
}

function MotorCard({
  motor,
  reserve,
  aircraftId,
}: {
  motor: Motor;
  reserve?: OverhaulReserve;
  aircraftId: string;
}) {
  const restantes =
    motor.tbo_restante ??
    Number(motor.tbo_horas) - (Number(motor.horas_totales) - Number(motor.turm));
  const horasVida = motor.horas_actuales ?? Number(motor.horas_totales);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{motor.posicion}</p>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            {motor.tipo}
          </Badge>
          <AircraftEngineButton aircraftId={aircraftId} engine={motor} />
        </div>
      </div>
      <p className="font-mono text-xs text-muted-foreground break-all">{motor.numero_serie}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini label="Horas de vida" value={`${fmtDecimal(horasVida)} hrs`} />
        <Mini label="TURM (últ. overhaul)" value={fmtDecimal(motor.turm)} />
        <Mini label="TBO" value={`${fmtDecimal(motor.tbo_horas)} hrs`} />
        <Mini
          label="Restantes a overhaul"
          value={`${fmtDecimal(restantes)} hrs`}
          className={restantes <= 0 ? "text-destructive font-semibold" : restantes <= 25 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}
        />
      </dl>
      {reserve && (
        <p className="pt-2 border-t border-border text-xs text-muted-foreground">
          Reserva: <span className="font-medium text-foreground">{fmtUsd(reserve.monto_por_hora_usd)} / hr</span>
        </p>
      )}
    </div>
  );
}

function PropellerCard({
  propeller,
  aircraftId,
}: {
  propeller: Propeller;
  aircraftId: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{propeller.posicion}</p>
        <AircraftPropellerButton aircraftId={aircraftId} propeller={propeller} />
      </div>
      <p className="font-mono text-xs text-muted-foreground break-all">{propeller.numero_serie}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini
          label="Horas de vida"
          value={`${fmtDecimal(propeller.horas_actuales ?? Number(propeller.horas_totales))} hrs`}
        />
        <Mini label="TBO" value={propeller.tbo_horas ? `${fmtDecimal(propeller.tbo_horas)} hrs` : "—"} />
        {propeller.tbo_restante != null && (
          <Mini
            label="Restantes a overhaul"
            value={`${fmtDecimal(propeller.tbo_restante)} hrs`}
            className={propeller.tbo_restante <= 0 ? "text-destructive font-semibold" : propeller.tbo_restante <= 25 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}
          />
        )}
      </dl>
    </div>
  );
}

function ReserveCard({ reserve, motors }: { reserve: OverhaulReserve; motors: Motor[] }) {
  const motor = motors.find((m) => m.id === reserve.motor_id);
  const acumulado = Number(reserve.monto_por_hora_usd) * Number(reserve.horas_acumuladas);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <p className="text-xs text-muted-foreground">
        {motor ? motor.posicion : "Sin motor asociado"}
      </p>
      <p className="text-lg font-semibold">{fmtUsd(acumulado)}</p>
      <p className="text-xs text-muted-foreground">
        {fmtDecimal(reserve.horas_acumuladas)} hrs × {fmtUsd(reserve.monto_por_hora_usd)} / hr
      </p>
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${className}`}>{value}</dd>
    </div>
  );
}

function motorOrden(a: Motor, b: Motor): number {
  const order = { UNICO: 0, IZQUIERDO: 1, DERECHO: 2 };
  return order[a.posicion] - order[b.posicion];
}

function propellerOrden(a: Propeller, b: Propeller): number {
  const order = { UNICA: 0, IZQUIERDA: 1, DERECHA: 2 };
  return order[a.posicion] - order[b.posicion];
}
