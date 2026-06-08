import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { listCalendar } from "@/lib/api/calendar-server";
import { ResyncGoogleButton } from "@/components/admin/calendar/resync-google-button";
import type { CalendarEvent } from "@/types/calendar";

export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = params.y ? Number(params.y) : now.getFullYear();
  // m: 1-12. Default mes actual.
  const month = params.m ? Number(params.m) - 1 : now.getMonth();

  const monthStart = new Date(year, month, 1, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  const { events } = await listCalendar({
    from: monthStart.toISOString(),
    to: monthEnd.toISOString(),
  });

  // Agrupa eventos por día local.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.fecha_vuelo) continue;
    const key = localKey(new Date(e.fecha_vuelo));
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }

  // Grilla de 6 semanas (42 celdas) arrancando en lunes de la semana del día 1.
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const prev = month === 0 ? { y: year - 1, m: 12 } : { y: year, m: month };
  const next = month === 11 ? { y: year + 1, m: 1 } : { y: year, m: month + 2 };
  const todayKey = localKey(now);

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

      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d) => (
              <div
                key={d}
                className="text-center text-[11px] uppercase tracking-wider text-muted-foreground py-1.5"
              >
                {d}
              </div>
            ))}
            {cells.map((date) => {
              const inMonth = date.getMonth() === month;
              const key = localKey(date);
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`min-h-24 rounded-lg border p-1.5 flex flex-col gap-1 ${
                    inMonth ? "border-border" : "border-transparent opacity-40"
                  } ${isToday ? "ring-1 ring-brand-500" : ""}`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isToday ? "text-brand-500" : "text-muted-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-col gap-1">
                    {dayEvents.map((e) => (
                      <EventChip key={e.id} ev={e} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EventChip({ ev }: { ev: CalendarEvent }) {
  const esRegreso = ev.tramo === "regreso";
  const vueloId = ev.id.split(":")[0];
  const label = `${ev.hora ? `${ev.hora} ` : ""}${ev.aeronave_matricula ?? ev.operador_externo ?? ""} ${ev.origen_iata}-${ev.destino_iata}`;
  return (
    <Link
      href={`/admin/flights/${vueloId}`}
      title={ev.title}
      className="block rounded px-1.5 py-1 text-[11px] leading-tight text-white truncate hover:opacity-90 transition-opacity"
      style={{ backgroundColor: ev.color }}
    >
      {esRegreso ? "↩ " : ev.estado_permiso === "pendiente" ? "⚠ " : ""}
      {label}
    </Link>
  );
}

function Legend() {
  const items = [
    { label: "Vuelo propio", color: "#9CA3AF", title: "Vuelo con avión asignado; el color es el configurado para esa aeronave." },
    {
      label: "Sin asignar",
      color: "#8B5CF6",
      title: "Vuelo confirmado al que aún le falta asignar avión y/o piloto.",
    },
    { label: "Externo", color: "#FFB6C1", title: "Vuelo operado por un tercero." },
    {
      label: "Permiso pendiente",
      color: "#F59E0B",
      title: "Un aeropuerto de la ruta requiere permiso de pista/operación y aún no se ha emitido. Se quita al marcarlo como “Emitido” en el vuelo (Editar → Permiso de pista, o el botón “Permiso emitido”).",
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
