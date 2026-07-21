import Link from "next/link";
import { fmtDate as sharedFmtDate, fmtDateTime as sharedFmtDateTime } from "@/lib/datetime";
import { notFound } from "next/navigation";
import {
  EnvelopeIcon,
  PhoneIcon,
  CreditCardIcon,
  CalendarDaysIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { getPilot } from "@/lib/api/pilots-server";
import { AccessToggle } from "@/components/admin/pilots/access-toggle";
import type {
  PilotCapture,
  PilotDetail,
  PilotExpense,
  PilotFlightSummary,
  PilotFondo,
} from "@/types/pilots";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const fmtDateTime = sharedFmtDateTime;
const fmtDate = sharedFmtDate;

export default async function PilotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let pilot: PilotDetail;
  try {
    pilot = await getPilot(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <BackLink
        href="/admin/pilots"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        iconClassName="h-4 w-4"
      >
        Pilotos
      </BackLink>

      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            {pilot.avatar_url && <AvatarImage src={pilot.avatar_url} alt={pilot.nombre} />}
            <AvatarFallback className="text-lg">{initials(pilot.nombre)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{pilot.nombre}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <EnvelopeIcon className="h-4 w-4" /> {pilot.email}
              </span>
              {pilot.telefono && (
                <span className="inline-flex items-center gap-1">
                  <PhoneIcon className="h-4 w-4" /> {pilot.telefono}
                </span>
              )}
              {pilot.tarjeta_terminacion && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <CreditCardIcon className="h-4 w-4" /> ····{pilot.tarjeta_terminacion}
                </span>
              )}
              {pilot.es_piloto_externo && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted">
                  Externo
                </span>
              )}
            </div>
          </div>
        </div>
        {pilot.es_piloto_externo ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
            Piloto externo: sin acceso al sistema.
          </p>
        ) : (
          <AccessToggle id={pilot.id} estado={pilot.estado} />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Vuelos mes" value={pilot.stats.vuelos_mes} />
        <Stat label="Próximos" value={pilot.stats.vuelos_proximos} />
        <Stat label="Capturas mes" value={pilot.stats.capturas_mes} />
        <Stat label="Gastos mes" value={pilot.stats.gastos_mes} />
        <Stat
          label="Cobrado mes"
          value={`$${pilot.stats.total_cobrado_mes_usd.toLocaleString("en-US")}`}
          isText
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <FlightsCard
          title="Próximos vuelos"
          flights={pilot.vuelos_proximos}
          empty="Sin vuelos programados."
        />
        <FlightsCard
          title="Vuelos completados (mes)"
          flights={pilot.vuelos_completados_mes}
          empty="Sin vuelos completados este mes."
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <CapturesCard captures={pilot.capturas_recientes} />
        <ExpensesCard expenses={pilot.gastos_recientes} />
      </div>

      {pilot.fondos.length > 0 && <FondosCard fondos={pilot.fondos} />}
    </div>
  );
}

function Stat({
  label,
  value,
  isText = false,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 font-semibold ${isText ? "text-lg" : "text-2xl"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FlightsCard({
  title,
  flights,
  empty,
}: {
  title: string;
  flights: PilotFlightSummary[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDaysIcon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {flights.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{empty}</p>
        ) : (
          flights.map((f) => (
            <Link
              key={f.id}
              href={`/admin/flights/${f.id}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {f.origen_iata} → {f.destino_iata}
                  <span className="text-muted-foreground font-normal ml-2">#{f.folio}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(f.fecha_vuelo)} · {f.pasajeros} pax · ${f.monto_total_usd} USD
                </p>
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                  f.estado === "EN_VUELO"
                    ? "bg-brand-500/15 text-brand-500"
                    : f.estado === "COMPLETADO"
                      ? "bg-muted text-muted-foreground"
                      : "bg-green-500/15 text-green-600 dark:text-green-400"
                }`}
              >
                {f.estado}
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CapturesCard({ captures }: { captures: PilotCapture[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Capturas recientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {captures.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sin capturas de tacómetro este mes.
          </p>
        ) : (
          captures.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {c.origen_iata} → {c.destino_iata}{" "}
                  <span className="text-muted-foreground text-xs">leg {c.orden}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Salida: {c.taco_salida ?? "—"} · Llegada: {c.taco_llegada ?? "—"} ·{" "}
                  {fmtDateTime(c.sincronizado_at)}
                  {c.capturado_offline && " · offline"}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ExpensesCard({ expenses }: { expenses: PilotExpense[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Gastos recientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin gastos este mes.</p>
        ) : (
          expenses.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{g.categoria}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(g.fecha_gasto)}
                  {g.foto_url ? " · con comprobante" : " · sin comprobante"}
                </p>
              </div>
              <p className="text-sm font-mono whitespace-nowrap">
                ${g.monto.toLocaleString("en-US")} {g.moneda}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FondosCard({ fondos }: { fondos: PilotFondo[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
          Fondos de caja chica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {fondos.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">
                {f.tipo} · {f.medio_pago_asociado}
              </p>
              <p className="text-xs text-muted-foreground">Asignado al piloto</p>
            </div>
            <p className="text-sm font-mono whitespace-nowrap">
              ${f.monto_asignado.toLocaleString("en-US")} {f.moneda}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
