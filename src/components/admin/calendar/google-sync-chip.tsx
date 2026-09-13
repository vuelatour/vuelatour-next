import { chipSyncGoogle, type TonoSyncGoogle } from "@/lib/admin/calendar-sync";
import type { CalendarSyncEstado } from "@/types/calendar";

/**
 * Chip de estado de la sincronización a Google Calendar, junto al botón
 * «Re-sincronizar Google» (C5 del pedido del 12-sep-2026). La oficina tiene
 * que poder ver de un vistazo si lo que captura en el sistema está llegando
 * al Google Calendar de la cuenta de operaciones — antes no había forma de
 * saberlo y la sync podía estar apagada sin que nadie se enterara.
 *
 * Todo el texto viene del helper puro `chipSyncGoogle` (probado con vitest);
 * aquí solo se pinta. Verde = encendida, ámbar = apagada (faltan variables en
 * Railway), gris = el API de este ambiente todavía no reporta el estado.
 */

const ESTILO: Record<TonoSyncGoogle, { chip: string; punto: string }> = {
  activo: {
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    punto: "bg-emerald-500",
  },
  apagado: {
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    punto: "bg-amber-500",
  },
  desconocido: {
    chip: "border-border bg-muted text-muted-foreground",
    punto: "bg-muted-foreground/60",
  },
};

export function GoogleSyncChip({
  estado,
}: {
  /** GET /v1/calendar/sync-estado; `null` = el API no lo reportó (404/403). */
  estado: CalendarSyncEstado | null;
}) {
  const chip = chipSyncGoogle(estado);
  const estilo = ESTILO[chip.tono];
  return (
    <span
      className="inline-flex max-w-[26rem] flex-col gap-0.5 cursor-help"
      title={chip.titulo}
    >
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${estilo.chip}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${estilo.punto}`} aria-hidden />
        {chip.texto}
      </span>
      {chip.detalle ? (
        <span className="text-[11px] leading-snug text-muted-foreground">
          {chip.detalle}
        </span>
      ) : null}
    </span>
  );
}
