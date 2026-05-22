import { apiServer } from "./server";
import type { CalendarResponse } from "@/types/calendar";

export interface CalendarQuery {
  from?: string;
  to?: string;
  aeronave_id?: string;
  piloto_id?: string;
  incluir_cancelados?: boolean;
  solo_externos?: boolean;
}

export function listCalendar(query: CalendarQuery = {}) {
  return apiServer<CalendarResponse>("/v1/calendar", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
