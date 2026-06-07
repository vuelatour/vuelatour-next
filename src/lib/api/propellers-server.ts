import { apiServer } from "./server";
import type { ListResponse } from "@/types/aircraft";

export interface Propeller {
  id: string;
  aeronave_id: string;
  posicion: string;
  numero_serie: string;
  fabricante: string | null;
  modelo: string | null;
  horas_totales: string;
  tbo_horas: string | null;
}

export interface ListPropellersQuery {
  aeronave_id?: string;
  limit?: number;
  offset?: number;
}

export function listPropellers(query: ListPropellersQuery = {}) {
  return apiServer<ListResponse<Propeller>>("/v1/propellers", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
