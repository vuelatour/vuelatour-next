import { apiServer } from "./server";
import type { CalendarResponse, CalendarSyncEstado } from "@/types/calendar";

export interface CalendarQuery {
  from?: string;
  to?: string;
  aeronave_id?: string;
  piloto_id?: string;
  incluir_cancelados?: boolean;
  solo_externos?: boolean;
  /** Mantenimientos con fecha como eventos (opt-in del API, skew-safe). */
  incluir_mantenimientos?: boolean;
}

export function listCalendar(query: CalendarQuery = {}) {
  return apiServer<CalendarResponse>("/v1/calendar", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * GET /v1/calendar/sync-estado (12-sep-2026) — estado de la sync a Google
 * Calendar para el chip del calendario. NUNCA lanza: un API viejo responde
 * 404 y un rol sin permiso 403, y en ambos casos el panel debe pintar
 * «estado no disponible» sin tumbar la página (el calendario no depende de
 * Google). `null` = no se pudo saber, que NO es lo mismo que «apagado».
 */
export async function getCalendarSyncEstado(): Promise<CalendarSyncEstado | null> {
  try {
    return await apiServer<CalendarSyncEstado>("/v1/calendar/sync-estado", {
      cache: "no-store",
    });
  } catch {
    return null;
  }
}
