import { apiServer } from "./server";
import type {
  FlightListItem,
  FlightListResponse,
  FlightSnapshot,
} from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";

export interface ListFlightsQuery {
  cliente_id?: string;
  aeronave_id?: string;
  piloto_id?: string;
  estado?: EstadoVuelo;
  es_externo?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listFlights(query: ListFlightsQuery = {}) {
  return apiServer<FlightListResponse>("/v1/flights", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getFlight(id: string) {
  return apiServer<FlightListItem>(`/v1/flights/${id}`, { cache: "no-store" });
}

export function getFlightSnapshot(id: string) {
  return apiServer<FlightSnapshot>(`/v1/flights/${id}/snapshot`, {
    cache: "no-store",
  });
}
