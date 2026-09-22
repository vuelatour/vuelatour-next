import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { getCalendarSyncEstado, listCalendar } from "@/lib/api/calendar-server";
import { listPilots } from "@/lib/api/pilots-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { MarkRestButton } from "@/components/admin/calendar/descansos";
import {
  CreateEventoButton,
  type EventoFlotaResumen,
  type OpcionAeronave,
  type OpcionResponsable,
} from "@/components/admin/calendar/eventos";
import { LeyendaSemaforo } from "@/components/admin/calendar/leyenda-semaforo";
import { ResyncGoogleButton } from "@/components/admin/calendar/resync-google-button";
import { GoogleSyncChip } from "@/components/admin/calendar/google-sync-chip";
import { syncEsAutomatica } from "@/lib/admin/calendar-sync";
import {
  CalendarGrid,
  type CalendarDay,
  type EventosCtx,
} from "@/components/admin/calendar/calendar-grid";
import type { CalendarEvent } from "@/types/calendar";
import type { Aircraft } from "@/types/aircraft";
import type { User } from "@/types/users";

export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Los EVENTOS se agrupan por día de CANCÚN, no del servidor: en Vercel (UTC)
// un vuelo del 1 jul 21:30 Cancún es 2 jul 02:30 UTC y caía en la celda
// equivocada. localKey se mantiene solo para las celdas sintéticas del grid.
const CANCUN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Cancun",
});
function cancunKey(d: Date): string {
  return CANCUN_DAY.format(d);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  // Mes por defecto en CANCÚN, no en la TZ del servidor: en Vercel (UTC), de
  // las 19:00 Cancún del último día del mes en adelante ya corre el mes
  // siguiente y el calendario abría en un mes "vacío".
  const hoyCancun = cancunKey(now); // YYYY-MM-DD
  const year = params.y ? Number(params.y) : Number(hoyCancun.slice(0, 4));
  // m: 1-12. Default mes actual.
  const month = params.m ? Number(params.m) - 1 : Number(hoyCancun.slice(5, 7)) - 1;

  // Rango del fetch ANCLADO a Cancún (UTC−5): con new Date(year, month, …) en
  // la TZ del servidor, los vuelos de 19:00–23:59 Cancún del último día del
  // mes quedaban fuera de /v1/calendar y no aparecían en su celda.
  const mes = String(month + 1).padStart(2, "0");
  const ultimoDia = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthStart = new Date(`${year}-${mes}-01T00:00:00-05:00`);
  const monthEnd = new Date(
    `${year}-${mes}-${String(ultimoDia).padStart(2, "0")}T23:59:59-05:00`,
  );

  const [{ events }, pilotsRes, aircraftRes, usersRes, syncEstado] = await Promise.all([
    listCalendar({
      from: monthStart.toISOString(),
      to: monthEnd.toISOString(),
      // Los servicios con fecha confirmada también son agenda de la flota.
      incluir_mantenimientos: true,
    }),
    listPilots({ estado: "ACTIVO", limit: 200 }).catch(() => ({ data: [] })),
    // Catálogos del editor de eventos (best-effort: sin ellos el calendario
    // carga igual, solo con selectores vacíos).
    listAircraft({ activa: true, limit: 100 }).catch(() => ({ data: [] as Aircraft[] })),
    // /v1/users es solo ADMIN: COORDINADOR cae al catálogo de pilotos.
    listUsers({ estado: "ACTIVO", limit: 200 }).catch(() => null),
    // Estado de la sync a Google Calendar para el chip (nunca lanza; null =
    // el API de este ambiente todavía no lo reporta).
    getCalendarSyncEstado(),
  ]);
  const pilots = (pilotsRes.data as { id: string; nombre: string; es_piloto_externo?: boolean }[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    es_piloto_externo: p.es_piloto_externo,
  }));

  // Responsables de eventos: cualquier usuario ACTIVO con app (no externos,
  // no visitantes). Con la lista de usuarios viene push_dispositivos y el
  // selector advierte "sin la app registrada" ANTES de agendar.
  const responsables: OpcionResponsable[] = usersRes
    ? (usersRes.data as User[])
        .filter((u) => u.estado === "ACTIVO" && !u.es_piloto_externo && u.rol !== "VISITANTE")
        .map((u) => ({
          id: u.id,
          nombre: u.nombre,
          rol: u.rol,
          push_dispositivos: u.push_dispositivos,
        }))
    : pilots
        .filter((p) => !p.es_piloto_externo)
        .map((p) => ({ id: p.id, nombre: p.nombre, rol: "PILOTO" }));
  responsables.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const aircraftOpts: OpcionAeronave[] = (aircraftRes.data as Aircraft[]).map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
  }));

  // Resumen por evento_flota para el botón Editar: el API expande un item
  // por día (id compuesto "evento:<id>:<día>"); el primer día trae la hora
  // real (hora != null) y sirve de inicio; el último día visible, de fin
  // aproximado cuando dura más de un día. Lo que no se conoce no se manda
  // en el PATCH y se conserva.
  const eventosFlota: Record<string, EventoFlotaResumen> = {};
  const ultimoDiaPorEvento = new Map<string, string>();
  const diasPorEvento = new Map<string, number>();
  for (const e of events) {
    if (e.tipo_evento !== "evento" || !e.evento_id || !e.fecha_vuelo) continue;
    const dia = cancunKey(new Date(e.fecha_vuelo));
    const r =
      eventosFlota[e.evento_id] ??
      (eventosFlota[e.evento_id] = {
        id: e.evento_id,
        titulo: e.titulo ?? e.title,
        notas: e.notas ?? null,
        aeronave_id: e.aeronave_id,
        responsable_id: e.piloto_id,
        responsable_nombre: e.piloto_nombre,
        fecha_inicio: null,
        fecha_fin_aprox: null,
      });
    if (e.hora) r.fecha_inicio = e.fecha_vuelo;
    diasPorEvento.set(e.evento_id, (diasPorEvento.get(e.evento_id) ?? 0) + 1);
    const prev = ultimoDiaPorEvento.get(e.evento_id);
    if (!prev || dia > prev) ultimoDiaPorEvento.set(e.evento_id, dia);
  }
  for (const [id, dias] of diasPorEvento) {
    if (dias > 1) eventosFlota[id]!.fecha_fin_aprox = ultimoDiaPorEvento.get(id) ?? null;
  }
  const eventosCtx: EventosCtx = { eventosFlota, aircraft: aircraftOpts, responsables };

  // Agrupa eventos por día local.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.fecha_vuelo) continue;
    const key = cancunKey(new Date(e.fecha_vuelo));
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }

  // Grilla de 6 semanas (42 celdas) arrancando en lunes de la semana del día 1.
  // Día de la semana por componentes UTC (determinista): monthStart ahora es
  // un instante −05:00 y su .getDay() dependería de la TZ del servidor.
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const prev = month === 0 ? { y: year - 1, m: 12 } : { y: year, m: month };
  const next = month === 11 ? { y: year + 1, m: 1 } : { y: year, m: month + 2 };
  const todayKey = cancunKey(now);

  const days: CalendarDay[] = cells.map((date) => {
    const key = localKey(date);
    return {
      key,
      iso: key,
      dayNum: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
      events: byDay.get(key) ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {MESES[month]} {year}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateEventoButton aircraft={aircraftOpts} responsables={responsables} />
          <MarkRestButton pilots={pilots} />
          <GoogleSyncChip estado={syncEstado} />
          <ResyncGoogleButton automatica={syncEsAutomatica(syncEstado)} />
          <Link
            href={`/admin/calendar?y=${prev.y}&m=${prev.m}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Mes anterior"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/calendar"
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted transition-colors"
          >
            Hoy
          </Link>
          <Link
            href={`/admin/calendar?y=${next.y}&m=${next.m}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Mes siguiente"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <Legend />

      <CalendarGrid days={days} eventosCtx={eventosCtx} />
    </div>
  );
}

/**
 * Leyenda del calendario = el semáforo de 5 colores (22-sep-2026). Los
 * renglones y la nota viven en `lib/admin/calendario-semaforo.ts`; aquí solo
 * se agrega el aviso de push, que no habla de colores.
 */
function Legend() {
  return (
    <LeyendaSemaforo>
      <span className="text-muted-foreground/70">
        Al agendar un evento se avisa por push al responsable; ⚠ = no tiene la app registrada
        (avísale por otro medio).
      </span>
    </LeyendaSemaforo>
  );
}
