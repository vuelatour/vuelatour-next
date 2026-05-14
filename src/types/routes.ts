import type { ListResponse } from "./aircraft";

export interface Route {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: string;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  fuente: string | null;
  notas: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export type RouteListResponse = ListResponse<Route>;
