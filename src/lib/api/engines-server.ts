import { apiServer } from "./server";
import type { ListResponse } from "@/types/aircraft";

export interface Engine {
  id: string;
  aeronave_id: string;
  posicion: string;
  numero_serie: string;
  tipo: string;
  horas_totales: string;
  tbo_horas: string;
}

export interface ListEnginesQuery {
  aeronave_id?: string;
  limit?: number;
  offset?: number;
}

export function listEngines(query: ListEnginesQuery = {}) {
  return apiServer<ListResponse<Engine>>("/v1/engines", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
