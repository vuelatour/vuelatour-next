import { apiServer } from "./server";
import type { Airport, AirportListResponse } from "@/types/airports";

export interface ListAirportsQuery {
  q?: string;
  pais?: string;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listAirports(query: ListAirportsQuery = {}) {
  return apiServer<AirportListResponse>("/v1/airports", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getAirport(id: string) {
  return apiServer<Airport>(`/v1/airports/${id}`, { cache: "no-store" });
}
