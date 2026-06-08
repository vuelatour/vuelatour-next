"use client";

import { useState } from "react";
import Link from "next/link";
import { XMarkIcon, ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEvent } from "@/types/calendar";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export interface CalendarDay {
  key: string;
  /** YYYY-MM-DD del día (para el título del panel). */
  iso: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

function tituloDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

export function CalendarGrid({ days }: { days: CalendarDay[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = days.find((d) => d.key === selectedKey) ?? null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <Card className="flex-1 min-w-0">
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
            {days.map((day) => (
              <div
                key={day.key}
                className={`min-h-24 rounded-lg border p-1.5 flex flex-col gap-1 transition-colors ${
                  day.inMonth ? "border-border" : "border-transparent opacity-40"
                } ${day.isToday ? "ring-1 ring-brand-500" : ""} ${
                  selectedKey === day.key ? "bg-muted/50 border-brand-600/40" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(day.key)}
                  className={`text-left text-xs font-medium rounded px-1 -mx-1 hover:bg-muted transition-colors ${
                    day.isToday ? "text-brand-500" : "text-muted-foreground"
                  }`}
                  title="Ver detalle del día"
                >
                  {day.dayNum}
                  {day.events.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      · {day.events.length}
                    </span>
                  )}
                </button>
                <div className="flex flex-col gap-1">
                  {day.events.slice(0, 3).map((e) => (
                    <EventChip key={e.id} ev={e} />
                  ))}
                  {day.events.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setSelectedKey(day.key)}
                      className="text-left text-[10px] text-muted-foreground hover:text-foreground px-1"
                    >
                      +{day.events.length - 3} más…
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card className="lg:w-80 shrink-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Detalle del día
                </p>
                <h3 className="text-base font-semibold capitalize">{tituloDia(selected.iso)}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.events.length === 0
                    ? "Sin vuelos"
                    : `${selected.events.length} vuelo${selected.events.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
                aria-label="Cerrar"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {selected.events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No hay vuelos agendados este día.
              </p>
            ) : (
              <div className="space-y-2">
                {selected.events.map((e) => (
                  <DayEvent key={e.id} ev={e} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
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

function DayEvent({ ev }: { ev: CalendarEvent }) {
  const esRegreso = ev.tramo === "regreso";
  const vueloId = ev.id.split(":")[0];
  return (
    <Link
      href={`/admin/flights/${vueloId}`}
      className="block rounded-lg border border-border p-2.5 hover:border-brand-600/40 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
          <span className="font-medium text-sm truncate">
            {esRegreso ? "↩ " : ""}
            {ev.hora ? `${ev.hora} · ` : ""}
            {ev.origen_iata}→{ev.destino_iata}
          </span>
        </div>
        <ArrowUpRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
        <p>
          #{ev.folio} · {ev.aeronave_matricula ?? ev.operador_externo ?? "Sin avión"} ·{" "}
          {ev.pasajeros} pax
        </p>
        <p>Piloto: {ev.piloto_nombre ?? (ev.es_externo ? "(externo)" : "sin asignar")}</p>
        {ev.cliente_nombre && <p>Cliente: {ev.cliente_nombre}</p>}
        {ev.estado_permiso === "pendiente" && (
          <p className="text-amber-600 dark:text-amber-400">⚠ Permiso de pista pendiente</p>
        )}
        {ev.sin_asignar && (
          <p className="text-violet-600 dark:text-violet-400">⚠ Falta asignar</p>
        )}
      </div>
    </Link>
  );
}
