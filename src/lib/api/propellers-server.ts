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
  // Derivados VIVOS calculados por el API (misma aritmética que el expediente
  // del avión — componenteEstado). Nunca recalcular localmente.
  horas_actuales?: number;
  horas_desde_overhaul?: number;
  /** TURM en marco del COMPONENTE (horas de vida al últ. overhaul). null = sin overhaul. */
  turm_componente?: number | null;
  tbo_restante?: number | null;
  vida_usada_pct?: number | null;
  hobbs_avion?: number;
  aeronave?: { matricula: string; modelo: string } | null;
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
