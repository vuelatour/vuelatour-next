import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CogIcon,
  CpuChipIcon,
  UsersIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
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
import { getAircraftSnapshot } from "@/lib/api/aircraft";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtPercent, fmtUsd } from "@/lib/format";
import type {
  AircraftOwner,
  Motor,
  OverhaulReserve,
  Propeller,
} from "@/types/aircraft";

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/aircraft"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Volver a la flota
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-mono font-semibold tracking-tight">
              {aircraft.matricula}
            </h1>
            <p className="text-base text-muted-foreground">{aircraft.modelo}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="font-mono">
              {aircraft.pais_registro}
            </Badge>
            {aircraft.activa ? (
              <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                Activa
              </Badge>
            ) : (
              <Badge variant="secondary">Inactiva</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AircraftImagesCard
          aircraftId={aircraft.id}
          matricula={aircraft.matricula}
          imagenes={aircraft.imagenes}
        />

        {/* Especificaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CogIcon className="h-4 w-4 text-muted-foreground" />
              Especificaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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

        {/* Propietarios */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
              Propietarios actuales
            </CardTitle>
            <CardDescription>
              {aircraft.owners.length} {aircraft.owners.length === 1 ? "propietario" : "propietarios"} vigentes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aircraft.owners.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin propietarios registrados.</p>
            ) : (
              aircraft.owners.map((o) => <OwnerRow key={o.id} owner={o} />)
            )}
          </CardContent>
        </Card>

        {/* Motores */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CpuChipIcon className="h-4 w-4 text-muted-foreground" />
              Motores
            </CardTitle>
            <CardDescription>{motorsSorted.length} unidades</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {motorsSorted.map((m) => (
              <MotorCard key={m.id} motor={m} reserve={reservesByMotor.get(m.id)} />
            ))}
          </CardContent>
        </Card>

        {/* Hélices */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CogIcon className="h-4 w-4 text-muted-foreground" />
              Hélices
            </CardTitle>
            <CardDescription>{propsSorted.length} unidades</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {propsSorted.map((p) => (
              <PropellerCard key={p.id} propeller={p} />
            ))}
          </CardContent>
        </Card>

        {/* Ingeniería aeronáutica: mantenimientos, permisos/licencias, servicios próximos */}
        <AircraftEngineering aircraftId={aircraft.id} />

        {/* Reservas overhaul (resumen) */}
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

function OwnerRow({ owner }: { owner: AircraftOwner }) {
  const nombre = owner.usuario?.nombre ?? "—";
  const esEmpresa = owner.usuario?.es_empresa ?? false;
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{nombre}</p>
        <p className="text-xs text-muted-foreground">
          {esEmpresa ? "Empresa" : owner.usuario?.rol ?? "Socio"} · desde{" "}
          {owner.vigente_desde}
        </p>
      </div>
      <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 font-mono">
        {fmtPercent(owner.porcentaje)}
      </Badge>
    </div>
  );
}

function MotorCard({ motor, reserve }: { motor: Motor; reserve?: OverhaulReserve }) {
  const restantes = Number(motor.tbo_horas) - (Number(motor.horas_totales) - Number(motor.turm));
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{motor.posicion}</p>
        <Badge variant="outline" className="text-xs">
          {motor.tipo}
        </Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground break-all">{motor.numero_serie}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini label="Horas totales" value={fmtDecimal(motor.horas_totales)} />
        <Mini label="TURM" value={fmtDecimal(motor.turm)} />
        <Mini label="TBO" value={`${fmtDecimal(motor.tbo_horas)} hrs`} />
        <Mini
          label="Restantes"
          value={`${fmtDecimal(restantes)} hrs`}
          className={restantes <= 0 ? "text-destructive font-semibold" : ""}
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

function PropellerCard({ propeller }: { propeller: Propeller }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <p className="text-sm font-semibold">{propeller.posicion}</p>
      <p className="font-mono text-xs text-muted-foreground break-all">{propeller.numero_serie}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
        <Mini label="Horas totales" value={fmtDecimal(propeller.horas_totales)} />
        <Mini label="TBO" value={propeller.tbo_horas ? `${fmtDecimal(propeller.tbo_horas)} hrs` : "—"} />
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
