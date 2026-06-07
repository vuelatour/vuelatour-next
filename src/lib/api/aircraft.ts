import { apiServer } from "./server";
import type {
  Aircraft,
  AircraftMetrics,
  AircraftSnapshot,
  ListResponse,
  PaisAeronave,
} from "@/types/aircraft";

export interface ListAircraftQuery {
  pais_registro?: PaisAeronave;
  activa?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listAircraft(query: ListAircraftQuery = {}) {
  return apiServer<ListResponse<Aircraft>>("/v1/aircraft", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getAircraftSnapshot(id: string) {
  return apiServer<AircraftSnapshot>(`/v1/aircraft/${id}/snapshot`, {
    cache: "no-store",
  });
}

export function getAircraftMetrics(id: string) {
  return apiServer<AircraftMetrics>(`/v1/aircraft/${id}/metrics`, {
    cache: "no-store",
  });
}
