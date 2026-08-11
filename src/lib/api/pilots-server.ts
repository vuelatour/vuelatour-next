import { apiServer } from "./server";
import type { PilotDetail, PilotsListResponse } from "@/types/pilots";

export interface ListPilotsQuery {
  q?: string;
  estado?: string;
  externo?: boolean;
  limit?: number;
  offset?: number;
}

export function listPilots(query: ListPilotsQuery = {}) {
  return apiServer<PilotsListResponse>("/v1/pilots", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getPilot(id: string, mes?: string) {
  return apiServer<PilotDetail>(`/v1/pilots/${id}`, {
    cache: "no-store",
    searchParams: { mes },
  });
}
