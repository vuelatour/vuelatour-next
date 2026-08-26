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
import {
  AircraftEngineButton,
  AircraftEngineDeleteButton,
} from "@/components/admin/aircraft/aircraft-engine-button";
import {
  AircraftPropellerButton,
  AircraftPropellerDeleteButton,
} from "@/components/admin/aircraft/aircraft-propeller-button";
import { AircraftInsuranceCard } from "@/components/admin/aircraft/aircraft-insurance-card";
import {
  AircraftMetricsCard,
  razonesNoApto,
} from "@/components/admin/aircraft/aircraft-metrics-card";
import { AircraftKpiStrip } from "@/components/admin/aircraft/aircraft-kpi-strip";
import { AircraftTacometrosCard } from "@/components/admin/aircraft/aircraft-tacometros-card";
import { AircraftFuelCard } from "@/components/admin/aircraft/aircraft-fuel-card";
import { AircraftSquawksCard } from "@/components/admin/aircraft/aircraft-squawks-card";
import {
  ComponentActions,
  type AeronaveDestinoOption,
} from "@/components/admin/aircraft/aircraft-component-actions";
import { ErrorState } from "@/components/admin/error-state";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import {
  getAircraftCombustibleMensual,
  getAircraftMetrics,
  getAircraftSnapshot,
  listAircraft,
  type AircraftMetricsDetalle,
  type CombustibleMensualResponse,
} from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { daysUntilCancun, fmtDate } from "@/lib/datetime";
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

  // Aeronaves activas: destinos posibles al trasladar un motor/hélice.
  // Best-effort: sin lista, el diálogo de traslado avisa que no hay destinos.
  let avionesDestino: AeronaveDestinoOption[] = [];
  try {
    const flota = await listAircraft({ activa: true, limit: 200 });
    avionesDestino = flota.data.map((a) => ({
      id: a.id,
      matricula: a.matricula,
      modelo: a.modelo,
    }));
  } catch {
    avionesDestino = [];
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

  // Detalle del gasto de combustible por mes (regla 26-ago: el gas es del
  // avión, no del vuelo). Mismo gate de roles financieros que /metrics:
  // 403 = rol sin permiso → la card no se pinta; cualquier otra falla se
  // pinta con ErrorState (nunca disfrazar una caída de "sin datos").
  let combustible: CombustibleMensualResponse | null = null;
  let combustibleError = false;
  try {
    combustible = await getAircraftCombustibleMensual(id);
  } catch (err) {
    if (!(isApiError(err) && err.status === 403)) combustibleError = true;
  }

  // Aptitud con respaldo del snapshot: /metrics está gateado por roles
  // financieros y el COORDINADOR se quedaba sin ver el NO APTO.
  const aptitud = metrics
    ? { apto: metrics.airworthiness.apto, razones: razonesNoApto(metrics.airworthiness) }
    : (aircraft.airworthiness ?? null);
  const razones = aptitud?.razones ?? [];

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
              {aptitud &&
                (aptitud.apto ? (
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

        {/* 2. Combustible por mes: detalle del gasto GAS del avión (cuadra con
            la hoja "combustible" del Balance Excel) */}
        {combustibleError ? (
          <ErrorState
            title="No se pudo cargar el combustible por mes"
            description="El resto del expediente sigue disponible. Recarga la página; si el problema persiste, avisa al administrador."
          />
        ) : (
          combustible && (
            <AircraftFuelCard aircraftId={aircraft.id} data={combustible} />
          )
        )}

        {/* 3. Tacómetros: histórico por aeronave + programa de servicio por etapas */}
        <AircraftTacometrosCard
          aircraftId={aircraft.id}
          matricula={aircraft.matricula}
          numMotores={aircraft.num_motores}
        />

        {/* 4. Bitácora de discrepancias (squawks) */}
        <AircraftSquawksCard aircraftId={aircraft.id} discrepancias={aircraft.discrepancias} />

        {/* 5. Viajes: historial de vuelos de esta aeronave */}
        <AircraftFlightsCard aircraftId={aircraft.id} />

        {/* 6. Ingeniería aeronáutica: mantenimientos, permisos, servicios próximos */}
        <AircraftEngineering aircraftId={aircraft.id} />

        {/* 7. Especificaciones */}
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

        {/* 8. Imágenes */}
        <AircraftImagesCard
          aircraftId={aircraft.id}
          matricula={aircraft.matricula}
          imagenes={aircraft.imagenes}
        />

        {/* 9-10. Propietarios y Seguros: cards angostas, emparejadas en desktop */}
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:!col-span-1">
          <AircraftOwnersCard
            aircraftId={aircraft.id}
            owners={aircraft.owners}
            socios={socios}
          />
          <AircraftInsuranceCard aircraftId={aircraft.id} seguros={aircraft.seguros} />
        </div>

        {/* 11. Motores */}
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
                  matricula={aircraft.matricula}
                  modelo={aircraft.modelo}
                  aviones={avionesDestino}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 12. Hélices */}
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
                <PropellerCard
                  key={p.id}
                  propeller={p}
                  aircraftId={aircraft.id}
                  matricula={aircraft.matricula}
                  modelo={aircraft.modelo}
                  aviones={avionesDestino}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 13. Reservas overhaul (resumen) */}
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

/** Barra de vida del ciclo TBO. El % lo calcula el API (`vida_usada_pct`). */
function VidaTboBar({ pct, agotado }: { pct: number; agotado: boolean }) {
  const color = agotado
    ? "bg-destructive"
    : pct >= 90
      ? "bg-amber-500"
      : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Vida usada del TBO</span>
        <span className="font-medium">{fmtDecimal(pct)} %</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

/** Pie de card: de dónde salen las horas vivas y quién tocó el componente. */
function ComponenteFooter({
  horasBase,
  ref_,
  hobbs,
  actualizado,
  quien,
}: {
  horasBase: number;
  ref_?: number | null;
  hobbs?: number;
  actualizado?: string;
  quien?: string | null;
}) {
  return (
    <div className="pt-2 border-t border-border space-y-0.5 text-[11px] text-muted-foreground">
      <p>
        Base capturada {fmtDecimal(horasBase)} hrs
        {ref_ != null && (
          <> · acumula desde el tacómetro {fmtDecimal(ref_)}{hobbs != null && <> (avión va en {fmtDecimal(hobbs)})</>}</>
        )}
      </p>
      {actualizado && (
        <p>
          Actualizado {fmtDate(actualizado)}
          {quien && <> · {quien}</>}
        </p>
      )}
    </div>
  );
}

function MotorCard({
  motor,
  reserve,
  aircraftId,
  matricula,
  modelo,
  aviones,
}: {
  motor: Motor;
  reserve?: OverhaulReserve;
  aircraftId: string;
  matricula: string;
  modelo: string;
  aviones: AeronaveDestinoOption[];
}) {
  // Los derivados vienen SIEMPRE del API (componenteEstado vía snapshot);
  // sin dato = "—", nunca una fórmula local de respaldo.
  const restantes = motor.tbo_restante ?? null;
  const horasVida = motor.horas_actuales ?? Number(motor.horas_totales);
  const desdeOverhaul = motor.horas_desde_overhaul ?? null;
  // Un motor no puede tener menos horas de vida que las que tenía en su
  // último overhaul: si pasa, falta capturar "Horas totales" en el motor.
  const horasIncoherentes =
    motor.turm_componente != null && motor.turm_componente > horasVida;
  const marcaModelo = [motor.fabricante, motor.modelo].filter(Boolean).join(" ");
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{motor.posicion}</p>
          <p className="font-mono text-xs text-muted-foreground break-all">
            S/N {motor.numero_serie}
          </p>
          {marcaModelo && <p className="text-xs text-muted-foreground">{marcaModelo}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className="text-xs">
            {motor.tipo}
          </Badge>
          <AircraftEngineButton aircraftId={aircraftId} engine={motor} />
          <AircraftEngineDeleteButton aircraftId={aircraftId} engine={motor} />
        </div>
      </div>
      {motor.vida_usada_pct != null && !horasIncoherentes && (
        <VidaTboBar pct={motor.vida_usada_pct} agotado={(restantes ?? 1) <= 0} />
      )}
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini label="Tiempo total (TSN)" value={`${fmtDecimal(horasVida)} hrs`} />
        <Mini
          label="Desde el últ. overhaul (TSO)"
          value={desdeOverhaul != null ? `${fmtDecimal(desdeOverhaul)} hrs` : "—"}
        />
        <Mini
          label="TURM (hrs del componente al últ. OVH)"
          value={motor.turm_componente != null ? fmtDecimal(motor.turm_componente) : "—"}
        />
        <Mini label="TBO" value={`${fmtDecimal(motor.tbo_horas)} hrs`} />
        <Mini
          label="Restantes a overhaul"
          value={restantes != null ? `${fmtDecimal(restantes)} hrs` : "—"}
          className={
            restantes == null
              ? ""
              : restantes <= 0
                ? "text-destructive font-semibold"
                : restantes <= 25
                  ? "text-amber-600 dark:text-amber-400 font-semibold"
                  : ""
          }
        />
        <VenceOverhaulMini fecha={motor.tbo_fecha} />
        {reserve && (
          <Mini
            label="Reserva overhaul"
            value={`${fmtUsd(reserve.monto_por_hora_usd)} / hr`}
          />
        )}
      </dl>
      {horasIncoherentes && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Revisar captura: el tiempo total (TSN) del motor ({fmtDecimal(horasVida)}) es menor al
          TURM ({fmtDecimal(motor.turm_componente)}). Edita el motor y captura sus horas totales
          reales.
        </p>
      )}
      {motor.notas && (
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas</p>
          <p className="text-xs mt-0.5 whitespace-pre-wrap">{motor.notas}</p>
        </div>
      )}
      <ComponentActions
        aircraftId={aircraftId}
        matricula={matricula}
        modelo={modelo}
        aviones={aviones}
        componente={{
          id: motor.id,
          tipo: "MOTOR",
          posicion: motor.posicion,
          numero_serie: motor.numero_serie,
          horas_actuales: motor.horas_actuales ?? null,
        }}
      />
      <ComponenteFooter
        horasBase={Number(motor.horas_totales)}
        ref_={motor.aeronave_horas_ref != null ? Number(motor.aeronave_horas_ref) : null}
        hobbs={motor.hobbs_avion}
        actualizado={motor.updated_at}
        quien={motor.actualizado_por?.nombre}
      />
    </div>
  );
}

function PropellerCard({
  propeller,
  aircraftId,
  matricula,
  modelo,
  aviones,
}: {
  propeller: Propeller;
  aircraftId: string;
  matricula: string;
  modelo: string;
  aviones: AeronaveDestinoOption[];
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{propeller.posicion}</p>
          <p className="font-mono text-xs text-muted-foreground break-all">
            S/N {propeller.numero_serie}
          </p>
          {(propeller.fabricante || propeller.modelo) && (
            <p className="text-xs text-muted-foreground">
              {[propeller.fabricante, propeller.modelo].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <AircraftPropellerButton aircraftId={aircraftId} propeller={propeller} />
          <AircraftPropellerDeleteButton aircraftId={aircraftId} propeller={propeller} />
        </div>
      </div>
      {propeller.vida_usada_pct != null && (
        <VidaTboBar
          pct={propeller.vida_usada_pct}
          agotado={(propeller.tbo_restante ?? 1) <= 0}
        />
      )}
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini
          label="Tiempo total (TSN)"
          value={`${fmtDecimal(propeller.horas_actuales ?? Number(propeller.horas_totales))} hrs`}
        />
        {propeller.horas_desde_overhaul != null && (
          <Mini
            label="Desde el últ. overhaul (TSO)"
            value={`${fmtDecimal(propeller.horas_desde_overhaul)} hrs`}
          />
        )}
        <Mini
          label="TURM (hrs del componente al últ. OVH)"
          value={
            propeller.turm_componente != null
              ? fmtDecimal(propeller.turm_componente)
              : "—"
          }
        />
        <Mini label="TBO" value={propeller.tbo_horas ? `${fmtDecimal(propeller.tbo_horas)} hrs` : "—"} />
        {propeller.tbo_restante != null && (
          <Mini
            label="Restantes a overhaul"
            value={`${fmtDecimal(propeller.tbo_restante)} hrs`}
            className={propeller.tbo_restante <= 0 ? "text-destructive font-semibold" : propeller.tbo_restante <= 25 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}
          />
        )}
        <VenceOverhaulMini fecha={propeller.tbo_fecha} />
      </dl>
      {propeller.notas && (
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas</p>
          <p className="text-xs mt-0.5 whitespace-pre-wrap">{propeller.notas}</p>
        </div>
      )}
      <ComponentActions
        aircraftId={aircraftId}
        matricula={matricula}
        modelo={modelo}
        aviones={aviones}
        componente={{
          id: propeller.id,
          tipo: "HELICE",
          posicion: propeller.posicion,
          numero_serie: propeller.numero_serie,
          horas_actuales: propeller.horas_actuales ?? null,
        }}
      />
      <ComponenteFooter
        horasBase={Number(propeller.horas_totales)}
        ref_={propeller.aeronave_horas_ref != null ? Number(propeller.aeronave_horas_ref) : null}
        hobbs={propeller.hobbs_avion}
        actualizado={propeller.updated_at}
        quien={propeller.actualizado_por?.nombre}
      />
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

/**
 * Límite CALENDARIO del overhaul (tbo_fecha): además del TBO por horas, el
 * componente puede vencer por tiempo ("TBO 12 años"). Rojo vencido, ámbar a
 * ≤60 días. Sin fecha capturada no ocupa espacio en la card.
 */
function VenceOverhaulMini({ fecha }: { fecha?: string | null }) {
  if (!fecha) return null;
  const dias = daysUntilCancun(fecha);
  const detalle =
    dias == null ? "" : dias < 0 ? " · VENCIDO" : ` · en ${dias} d`;
  return (
    <Mini
      label="Vence overhaul (fecha)"
      value={`${fmtDate(fecha)}${detalle}`}
      className={
        dias != null && dias < 0
          ? "text-destructive font-semibold"
          : dias != null && dias <= 60
            ? "text-amber-600 dark:text-amber-400 font-semibold"
            : ""
      }
    />
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
