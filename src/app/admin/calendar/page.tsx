import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { listCalendar } from "@/lib/api/calendar-server";
import { listPilots } from "@/lib/api/pilots-server";
import { MarkRestButton } from "@/components/admin/calendar/descansos";
import { ResyncGoogleButton } from "@/components/admin/calendar/resync-google-button";
import { CalendarGrid, type CalendarDay } from "@/components/admin/calendar/calendar-grid";
import type { CalendarEvent } from "@/types/calendar";

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

  const [{ events }, pilotsRes] = await Promise.all([
    listCalendar({ from: monthStart.toISOString(), to: monthEnd.toISOString() }),
    listPilots({ estado: "ACTIVO", limit: 200 }).catch(() => ({ data: [] })),
  ]);
  const pilots = (pilotsRes.data as { id: string; nombre: string }[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));

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
        <div className="flex items-center gap-2">
          <MarkRestButton pilots={pilots} />
          <ResyncGoogleButton />
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

      <CalendarGrid days={days} />
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Vuelo propio", color: "#9CA3AF", title: "Vuelo con avión asignado; el color es el configurado para esa aeronave." },
    {
      label: "Evento (no vuelo)",
      color: "#0EA5E9",
      title: "Lavado, trámite, visita… agendado desde la app o el panel. Con avión toma su color.",
    },
    {
      label: "Tentativo",
      color: "#64748B",
      title: "Reserva tentativa: espacio apartado sin cotización (el cliente aún no confirma). Se cotiza desde el detalle del vuelo.",
    },
    {
      label: "Sin asignar",
      color: "#8B5CF6",
      title: "Vuelo confirmado al que aún le falta asignar avión y/o piloto.",
    },
    { label: "Externo", color: "#FFB6C1", title: "Vuelo operado por un tercero." },
    {
      label: "Descanso",
      color: "#14B8A6",
      title: "Día de descanso de un piloto (botón “Marcar descanso”). Al asignar vuelos, el piloto aparece con aviso esos días.",
    },
    {
      label: "Permiso pendiente",
      color: "#F59E0B",
      title: "Un aeropuerto de la ruta requiere permiso de pista/operación y aún no se ha emitido. Se quita al marcarlo como “Emitido” en el vuelo (Editar → Permiso de pista, o el botón “Permiso emitido”).",
    },
    {
      label: "Cancelado",
      color: "#EF4444",
      title: "Vuelo cancelado: se queda en el calendario como historial de operaciones — existió la solicitud y luego se canceló.",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 cursor-help" title={i.title}>
          <span className="h-3 w-3 rounded" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
      <span className="text-muted-foreground/70">
        El color de la aeronave se configura por aeronave; aquí se muestra el real de cada vuelo.
      </span>
    </div>
  );
}
