import Link from "next/link";
import { fmtDate as sharedFmtDate, fmtDateTime as sharedFmtDateTime } from "@/lib/datetime";
import { notFound } from "next/navigation";
import {
  EnvelopeIcon,
  PhoneIcon,
  CreditCardIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  DocumentCheckIcon,
  ChevronRightIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isApiError } from "@/lib/api/errors";
import { getPilot } from "@/lib/api/pilots-server";
import { listExpirations } from "@/lib/api/expirations-server";
import { AccessToggle } from "@/components/admin/pilots/access-toggle";
import { MesStatsSelector } from "@/components/admin/pilots/mes-stats-selector";
import { VerDocumentoButton } from "@/components/admin/expirations/ver-documento-button";
import type { Expiration, EstadoVencimiento } from "@/types/expirations";
import type {
  PilotCapture,
  PilotDescanso,
  PilotDetail,
  PilotExpense,
  PilotFlightSummary,
  PilotFondo,
  PilotHonorarios,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;

  let pilot: PilotDetail;
  try {
    pilot = await getPilot(id, mes);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  // Licencias/médico del piloto (vencimientos con sus copias): antes solo se
  // veían filtrando la tabla general de Vencimientos. Tolerante: si la lista
  // falla, la ficha carga sin la card (no es dato operativo del día).
  const vencimientos: Expiration[] = await listExpirations({
    piloto_id: id,
    limit: 100,
  })
    .then((r) => r.data)
    .catch(() => []);

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

      {/* Stats del MES elegido (default: corriente). El resto del expediente
          (activos, recientes, documentos) no depende del mes. */}
      <div className="flex items-center justify-end">
        <MesStatsSelector
          mes={
            pilot.stats.mes ??
            // Fallback con API viejo: mes corriente en hora CANCÚN (no UTC).
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Cancun",
              year: "numeric",
              month: "2-digit",
            }).format(new Date())
          }
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Vuelos mes" value={pilot.stats.vuelos_mes} />
        {/* Horas del mes con semáforo del límite informativo de 90 hrs
            (doc 3.6): rojo al exceder, ámbar arriba del 85%. */}
        <Stat
          label="Horas mes"
          isText
          value={`${(pilot.stats.horas_mes ?? 0).toLocaleString("en-US")} / ${pilot.stats.horas_limite ?? 90} hr`}
          valueClass={
            (pilot.stats.horas_mes ?? 0) >= (pilot.stats.horas_limite ?? 90)
              ? "text-destructive"
              : (pilot.stats.horas_mes ?? 0) >=
                  (pilot.stats.horas_limite ?? 90) * 0.85
                ? "text-amber-600 dark:text-amber-400"
                : undefined
          }
        />
        <Stat label="Activos y próximos" value={pilot.stats.vuelos_proximos} />
        <Stat label="Capturas mes" value={pilot.stats.capturas_mes} />
        <Stat label="Gastos mes" value={pilot.stats.gastos_mes} />
        <Stat
          label="Cobrado mes"
          value={`$${pilot.stats.total_cobrado_mes_usd.toLocaleString("en-US")}`}
          isText
        />
      </div>
      {(pilot.stats.cobrado_sin_tc_mxn ?? 0) > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 -mt-3">
          Cobros del mes por ${pilot.stats.cobrado_sin_tc_mxn?.toLocaleString("en-US")}{" "}
          MXN sin tipo de cambio quedaron fuera del total cobrado.
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <FlightsCard
          title="Activos y próximos"
          flights={pilot.vuelos_proximos}
          empty="Sin vuelos activos ni programados."
        />
        <FlightsCard
          title="Últimos vuelos completados"
          flights={pilot.vuelos_completados_mes}
          empty="Sin vuelos completados aún."
          footer={
            <Link
              href={`/admin/flights?piloto_id=${pilot.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver historial completo en Vuelos{" "}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>

      {(pilot.honorarios || (pilot.descansos_proximos?.length ?? 0) > 0) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {pilot.honorarios && <HonorariosCard honorarios={pilot.honorarios} />}
          {(pilot.descansos_proximos?.length ?? 0) > 0 && (
            <DescansosCard descansos={pilot.descansos_proximos!} />
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <CapturesCard captures={pilot.capturas_recientes} />
        <ExpensesCard expenses={pilot.gastos_recientes} />
      </div>

      <DocumentosCard pilotoId={pilot.id} vencimientos={vencimientos} />

      {pilot.fondos.length > 0 && <FondosCard fondos={pilot.fondos} />}
    </div>
  );
}

const ESTADO_VENC_STYLES: Record<EstadoVencimiento, string> = {
  VIGENTE: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  PROXIMO: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  VENCIDO: "bg-destructive/15 text-destructive border-destructive/30",
  PERMANENTE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  INDETERMINADO: "bg-muted text-muted-foreground border-border",
};

const ESTADO_VENC_LABELS: Record<EstadoVencimiento, string> = {
  VIGENTE: "Vigente",
  PROXIMO: "Próximo",
  VENCIDO: "Vencido",
  PERMANENTE: "Permanente",
  INDETERMINADO: "Sin dato",
};

/** Licencias y certificados del piloto, con su copia adjunta si existe. */
function DocumentosCard({
  pilotoId,
  vencimientos,
}: {
  pilotoId: string;
  vencimientos: Expiration[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <DocumentCheckIcon className="h-4 w-4 text-muted-foreground" />
          Documentos y licencias
        </CardTitle>
        <Link
          href={`/admin/expirations?piloto_id=${pilotoId}`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Gestionar <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {vencimientos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin documentos registrados. Regístralos en Vencimientos (licencia,
            certificado médico…) para que el sistema vigile su vigencia.
          </p>
        ) : (
          vencimientos.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {v.tipo?.nombre ?? "Documento"}
                  {v.referencia && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {v.referencia}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {v.vence_por === "FECHA" && v.fecha_vencimiento
                    ? `Vence ${sharedFmtDate(v.fecha_vencimiento)}`
                    : v.vence_por === "PERMANENTE"
                      ? "Permanente"
                      : v.fecha_vencimiento
                        ? `Vence ${sharedFmtDate(v.fecha_vencimiento)}`
                        : "—"}
                </p>
                {v.archivo_url && <VerDocumentoButton expirationId={v.id} />}
              </div>
              <Badge variant="outline" className={ESTADO_VENC_STYLES[v.estado]}>
                {ESTADO_VENC_LABELS[v.estado]}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  isText = false,
  valueClass,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
  /** Color del valor (semáforo de horas, etc.). */
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={`mt-1 font-semibold ${isText ? "text-lg" : "text-2xl"} ${valueClass ?? ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function FlightsCard({
  title,
  flights,
  empty,
  footer,
}: {
  title: string;
  flights: PilotFlightSummary[];
  empty: string;
  footer?: React.ReactNode;
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
              {/* Rol del piloto cuando NO es el piloto principal: copiloto,
                  apoyo o piloto de algún tramo (rotación). */}
              {f.rol && f.rol !== "PILOTO" && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  {f.rol === "TRAMO" ? "por tramo" : f.rol.toLowerCase()}
                </span>
              )}
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
        {footer && <div className="pt-1">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/** Pagos al piloto EXTERNO (gastos PILOTO_EXTERNO de sus vuelos, doc 3.7). */
function HonorariosCard({ honorarios }: { honorarios: PilotHonorarios }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
          Honorarios (piloto externo)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Este mes
            </p>
            <p className="font-semibold font-mono">
              ${honorarios.mes_usd.toLocaleString("en-US")} USD
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Histórico
            </p>
            <p className="font-semibold font-mono">
              ${honorarios.total_usd.toLocaleString("en-US")} USD
            </p>
          </div>
        </div>
        {honorarios.sin_tc_mxn > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ${honorarios.sin_tc_mxn.toLocaleString("en-US")} MXN de honorarios
            sin tipo de cambio quedaron fuera del total.
          </p>
        )}
        {honorarios.recientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin honorarios capturados. Se registran como gasto categoría
            «Piloto externo» ligado al vuelo.
          </p>
        ) : (
          <div className="space-y-1.5">
            {honorarios.recientes.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-muted-foreground text-xs">
                  {sharedFmtDate(h.fecha_gasto)}
                  {h.folio != null && (
                    <>
                      {" · "}
                      {h.vuelo_id ? (
                        <Link
                          href={`/admin/flights/${h.vuelo_id}`}
                          className="hover:underline"
                        >
                          vuelo #{h.folio}
                        </Link>
                      ) : (
                        <>vuelo #{h.folio}</>
                      )}
                    </>
                  )}
                </span>
                <span className="font-mono font-medium">
                  ${Number(h.monto).toLocaleString("en-US")} {h.moneda}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Descansos vigentes o futuros del piloto: clave al asignarle vuelos. */
function DescansosCard({ descansos }: { descansos: PilotDescanso[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MoonIcon className="h-4 w-4 text-muted-foreground" />
          Descansos próximos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {descansos.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium">
              {sharedFmtDate(d.fecha_inicio)} – {sharedFmtDate(d.fecha_fin)}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {d.motivo ?? "Descanso"}
            </span>
          </div>
        ))}
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
