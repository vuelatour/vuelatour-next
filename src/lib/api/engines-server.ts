import { apiServer } from "./server";
import type { ListResponse } from "@/types/aircraft";

export interface Engine {
  id: string;
  aeronave_id: string;
  posicion: string;
  numero_serie: string;
  tipo: string;
  fabricante: string | null;
  modelo: string | null;
  horas_totales: string;
  /** LEGADO: taco del avión en el últ. overhaul. Las listas ya no lo muestran. */
  turm: string;
  tbo_horas: string;
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
