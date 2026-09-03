import Link from "next/link";
import {
  fmtDate as sharedFmtDate,
  fmtDateTime as sharedFmtDateTime,
  fmtWeekdayDateTime,
} from "@/lib/datetime";
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
  ClockIcon,
  ReceiptPercentIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
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
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import type { EventoMe } from "@/types/calendar";
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

/** Instante ISO → día Cancún YYYY-MM-DD (para saber si una cita es hoy). */
function diaCancun(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun" }).format(
    new Date(iso),
  );
}

/** Hoy en Cancún como YYYY-MM-DD (los descansos son días de pared). */
function hoyCancun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun" }).format(
    new Date(),
  );
}

/** Badge de estado con la FUENTE ÚNICA (estado-vuelo.ts); estado desconocido
 *  cae a gris en vez de romper. */
function EstadoBadge({ estado }: { estado: string }) {
  const cls =
    ESTADO_STYLES[estado as EstadoVuelo] ?? "bg-muted text-muted-foreground border-border";
  const label = ESTADO_LABELS[estado as EstadoVuelo] ?? estado;
  return (
    <Badge variant="outline" className={`shrink-0 ${cls}`}>
      {label}
    </Badge>
  );
}

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

      {/* Franja de alertas (21-ago): lo que oficina debe ver ANTES de asignarle
          un vuelo — documentos vencidos/por vencer, descanso activo hoy y horas
          cerca del límite. Solo aparece si hay algo. */}
      <AlertasPiloto
        pilotoId={pilot.id}
        vencimientos={vencimientos}
        descansos={pilot.descansos_proximos ?? []}
        eventos={pilot.eventos_proximos ?? []}
        horasMes={pilot.stats.horas_mes ?? 0}
        horasLimite={pilot.stats.horas_limite ?? 90}
      />

      {/* Stats del MES elegido (default: corriente). El resto del expediente
          (activos, recientes, documentos) no depende del mes. El selector
          vive EN el encabezado de la sección — flotando solo parecía perdido. */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Resumen del mes
          </h2>
          <p className="text-xs text-muted-foreground">
            Vuelos, horas, capturas y dinero del mes elegido.
          </p>
        </div>
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

      {/* Tres grupos con peso distinto: OPERACIÓN (lo que vuela), CAPTURA
          (disciplina en la app) y DINERO. Las horas llevan barra contra el
          límite informativo de 90 h (doc 3.6): ámbar arriba del 85%, rojo al
          exceder. */}
      <div className="grid gap-3 md:grid-cols-3">
        <GrupoStats titulo="Operación" icon={CalendarDaysIcon}>
          <Stat label="Vuelos" value={pilot.stats.vuelos_mes} hint="en el mes" />
          <Stat
            label="Activos y próximos"
            value={pilot.stats.vuelos_proximos}
            hint="hoy y programados"
          />
          <HorasStat
            horas={pilot.stats.horas_mes ?? 0}
            limite={pilot.stats.horas_limite ?? 90}
          />
        </GrupoStats>
        <GrupoStats titulo="Captura en la app" icon={ClockIcon}>
          <Stat
            label="Tacómetros"
            value={pilot.stats.capturas_mes}
            hint="lecturas sincronizadas"
          />
          <Stat
            label="Gastos"
            value={pilot.stats.gastos_mes}
            hint="capturados por el piloto"
          />
        </GrupoStats>
        <GrupoStats titulo="Dinero" icon={BanknotesIcon}>
          <Stat
            label="Cobrado"
            value={`$${pilot.stats.total_cobrado_mes_usd.toLocaleString("en-US")}`}
            isText
            hint="recibido de sus vuelos (USD)"
          />
          {pilot.honorarios && (
            <Stat
              label="Honorarios"
              value={`$${pilot.honorarios.mes_usd.toLocaleString("en-US")}`}
              isText
              hint="pagados al externo (USD)"
            />
          )}
        </GrupoStats>
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

      {/* Expediente: documentos y descansos van ANTES de capturas/gastos —
          son lo que oficina revisa al asignar. Los descansos siempre se
          muestran (vacío = "sin descansos", no una card que desaparece). */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DocumentosCard pilotoId={pilot.id} vencimientos={vencimientos} />
        <DescansosCard descansos={pilot.descansos_proximos ?? []} />
      </div>

      {/* Eventos NO-vuelo de los que es responsable (3-sep-2026): oficina
          ve aquí qué citas tiene pendientes y si le llegó el aviso es cosa
          del calendario. */}
      <div className="grid lg:grid-cols-2 gap-4">
        <EventosCard eventos={pilot.eventos_proximos ?? []} />
        {pilot.honorarios && <HonorariosCard honorarios={pilot.honorarios} />}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <CapturesCard captures={pilot.capturas_recientes} />
        <ExpensesCard expenses={pilot.gastos_recientes} />
      </div>

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

/** Grupo de cifras con título: agrupa las stats por tema en vez de seis
 *  cajas iguales en fila. */
function GrupoStats({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-medium">
          <Icon className="h-3.5 w-3.5" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 pb-4">{children}</CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  isText = false,
  valueClass,
  hint,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
  /** Color del valor (semáforo de horas, etc.). */
  valueClass?: string;
  /** Aclaración corta bajo el valor (qué mide exactamente la cifra). */
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${isText ? "text-lg" : "text-2xl"} ${valueClass ?? ""}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Horas del mes con barra contra el límite informativo (doc 3.6). */
function HorasStat({ horas, limite }: { horas: number; limite: number }) {
  const pct = limite > 0 ? Math.min(100, (horas / limite) * 100) : 0;
  const estado = horas >= limite ? "rojo" : horas >= limite * 0.85 ? "ambar" : "ok";
  const color =
    estado === "rojo"
      ? "bg-destructive"
      : estado === "ambar"
        ? "bg-amber-500"
        : "bg-green-500";
  const texto =
    estado === "rojo"
      ? "text-destructive"
      : estado === "ambar"
        ? "text-amber-600 dark:text-amber-400"
        : "";
  const restantes = Math.max(0, limite - horas);
  return (
    <div className="col-span-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Horas voladas</p>
        <p className="text-[11px] text-muted-foreground">límite informativo {limite} h</p>
      </div>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${texto}`}>
        {horas.toLocaleString("en-US", { maximumFractionDigits: 1 })}
        <span className="text-sm font-normal text-muted-foreground"> / {limite} h</span>
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {estado === "rojo"
          ? `Excedió el límite por ${(horas - limite).toLocaleString("en-US", { maximumFractionDigits: 1 })} h`
          : `Le quedan ${restantes.toLocaleString("en-US", { maximumFractionDigits: 1 })} h este mes`}
      </p>
    </div>
  );
}

/**
 * Franja de alertas del piloto: documentos vencidos / por vencer, descanso
 * activo hoy y horas cerca del límite. Vacía = no se pinta nada.
 */
function AlertasPiloto({
  pilotoId,
  vencimientos,
  descansos,
  eventos,
  horasMes,
  horasLimite,
}: {
  pilotoId: string;
  vencimientos: Expiration[];
  descansos: PilotDescanso[];
  eventos: EventoMe[];
  horasMes: number;
  horasLimite: number;
}) {
  const hoy = hoyCancun();
  const citasHoy = eventos.filter((e) => diaCancun(e.fecha) === hoy);
  const vencidos = vencimientos.filter((v) => v.estado === "VENCIDO");
  const proximos = vencimientos.filter((v) => v.estado === "PROXIMO");
  const descansoHoy = descansos.find(
    (d) => d.fecha_inicio.slice(0, 10) <= hoy && d.fecha_fin.slice(0, 10) >= hoy,
  );
  const items: { tono: "rojo" | "ambar"; texto: string; href?: string }[] = [];
  if (vencidos.length > 0) {
    items.push({
      tono: "rojo",
      texto: `${vencidos.length === 1 ? "Documento vencido" : `${vencidos.length} documentos vencidos`}: ${vencidos
        .map((v) => v.tipo?.nombre ?? "documento")
        .join(", ")}`,
      href: `/admin/expirations?piloto_id=${pilotoId}`,
    });
  }
  if (proximos.length > 0) {
    items.push({
      tono: "ambar",
      texto: `Por vencer: ${proximos
        .map(
          (v) =>
            `${v.tipo?.nombre ?? "documento"}${v.fecha_vencimiento ? ` (${fmtDate(v.fecha_vencimiento)})` : ""}`,
        )
        .join(", ")}`,
      href: `/admin/expirations?piloto_id=${pilotoId}`,
    });
  }
  if (descansoHoy) {
    items.push({
      tono: "ambar",
      texto: `Hoy está de descanso (${fmtDate(descansoHoy.fecha_inicio)} – ${fmtDate(descansoHoy.fecha_fin)}${descansoHoy.motivo ? ` · ${descansoHoy.motivo}` : ""}).`,
    });
  }
  for (const c of citasHoy) {
    items.push({
      tono: "ambar",
      texto: `Hoy tiene cita: ${fmtWeekdayDateTime(c.fecha)} · ${c.titulo}${c.aeronave_matricula ? ` · ${c.aeronave_matricula}` : ""}${c.notas ? ` · ${c.notas}` : ""}`,
      href: `/admin/calendar?y=${hoy.slice(0, 4)}&m=${Number(hoy.slice(5, 7))}`,
    });
  }
  if (horasLimite > 0 && horasMes >= horasLimite) {
    items.push({
      tono: "rojo",
      texto: `Excedió el límite informativo de ${horasLimite} h este mes (${horasMes.toLocaleString("en-US", { maximumFractionDigits: 1 })} h).`,
    });
  } else if (horasLimite > 0 && horasMes >= horasLimite * 0.85) {
    items.push({
      tono: "ambar",
      texto: `Cerca del límite de ${horasLimite} h: lleva ${horasMes.toLocaleString("en-US", { maximumFractionDigits: 1 })} h este mes.`,
    });
  }
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const cls =
          it.tono === "rojo"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
        const inner = (
          <span className="inline-flex items-start gap-2 text-sm">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{it.texto}</span>
          </span>
        );
        return it.href ? (
          <Link
            key={i}
            href={it.href}
            className={`block rounded-lg border px-3 py-2 hover:opacity-90 transition-opacity ${cls}`}
          >
            {inner}
          </Link>
        ) : (
          <div key={i} className={`rounded-lg border px-3 py-2 ${cls}`}>
            {inner}
          </div>
        );
      })}
    </div>
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
          // Tope con scroll interno: 20 completados estiraban la card y
          // desbalanceaban la fila; el footer (historial) queda siempre a la
          // vista.
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {flights.map((f) => (
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
                  {fmtDateTime(f.fecha_vuelo)}
                  {/* Viaje multi-día: se ve hasta cuándo dura. */}
                  {f.fecha_fin &&
                    f.fecha_vuelo &&
                    f.fecha_fin.slice(0, 10) !== f.fecha_vuelo.slice(0, 10) &&
                    ` → ${fmtDate(f.fecha_fin)}`}
                  {" · "}
                  {f.pasajeros} pax
                  {/* El precio solo cuando existe: "$0 USD" en cada renglón
                      era ruido (internos y ferris cotizan en cero). */}
                  {Number(f.monto_total_usd) > 0 &&
                    ` · $${Number(f.monto_total_usd).toLocaleString("en-US")} USD`}
                </p>
              </div>
              {/* Rol del piloto cuando NO es el piloto principal: copiloto,
                  apoyo o piloto de algún tramo (rotación). */}
              {f.rol && f.rol !== "PILOTO" && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  {f.rol === "TRAMO" ? "por tramo" : f.rol.toLowerCase()}
                </span>
              )}
              <EstadoBadge estado={f.estado} />
            </Link>
            ))}
          </div>
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
        {descansos.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Sin descansos marcados. Se capturan desde el Calendario (Marcar
            descanso) o desde la app.
          </p>
        )}
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

/**
 * Eventos NO-vuelo (citas, trámites, lavados) de los que el piloto es
 * responsable: hoy → +60 días. Incidente 3-sep-2026: una cita agendada desde
 * la app no llegó al piloto y oficina no tenía dónde verla en su expediente.
 */
function EventosCard({ eventos }: { eventos: EventoMe[] }) {
  const hoy = hoyCancun();
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardDocumentCheckIcon className="h-4 w-4 text-muted-foreground" />
          Eventos y citas próximos
        </CardTitle>
        <Link
          href="/admin/calendar"
          className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Calendario <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {eventos.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Sin eventos asignados. Se agendan desde el Calendario (Nuevo
            evento) o desde la app.
          </p>
        )}
        {eventos.map((e) => {
          const esHoy = diaCancun(e.fecha) === hoy;
          const finOtroDia = e.fecha_fin && diaCancun(e.fecha_fin) !== diaCancun(e.fecha);
          return (
            <div
              key={e.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                esHoy ? "border-amber-500/40 bg-amber-500/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate">
                  {fmtWeekdayDateTime(e.fecha)}
                  {finOtroDia && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      → {sharedFmtDate(e.fecha_fin)}
                    </span>
                  )}
                  {" · "}
                  {e.titulo}
                </p>
                {esHoy && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Hoy
                  </span>
                )}
              </div>
              {(e.aeronave_matricula || e.notas) && (
                <p className="text-xs text-muted-foreground">
                  {[e.aeronave_matricula, e.notas].filter(Boolean).join(" · ")}
                </p>
              )}
              {e.creado_por_nombre && (
                <p className="text-[11px] text-muted-foreground/70">
                  Agendó: {e.creado_por_nombre}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CapturesCard({ captures }: { captures: PilotCapture[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-muted-foreground" />
          Tacómetros recientes
        </CardTitle>
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
                  {c.origen_iata} → {c.destino_iata}
                </p>
                <p className="text-xs text-muted-foreground">
                  Salida {c.taco_salida ?? "—"} · Llegada {c.taco_llegada ?? "—"} ·{" "}
                  {fmtDateTime(c.sincronizado_at)}
                  {c.capturado_offline && " · offline"}
                </p>
              </div>
              {/* Horas del tramo: la cifra que alimenta el balance. */}
              {c.taco_salida != null && c.taco_llegada != null && (
                <span className="text-sm font-mono tabular-nums whitespace-nowrap">
                  {(Number(c.taco_llegada) - Number(c.taco_salida)).toFixed(1)} h
                </span>
              )}
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
        <CardTitle className="text-base flex items-center gap-2">
          <ReceiptPercentIcon className="h-4 w-4 text-muted-foreground" />
          Gastos recientes
        </CardTitle>
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
                <p className="text-sm font-medium">{categoriaGastoLabel(g.categoria)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(g.fecha_gasto)}
                  {g.foto_url ? (
                    " · con comprobante"
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400"> · sin comprobante</span>
                  )}
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
