import type { ListResponse } from "./aircraft";

export type TipoRuta = "SIMPLE" | "MULTIESCALA";
export type TipoParada = "NORMAL" | "SERVICIO";

export interface RouteTramo {
  id: string;
  ruta_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: string;
  // Detalle por tramo (defaults de plantilla).
  pasajeros: number | null;
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: TipoParada;
  servicio_notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: string;
  tipo: TipoRuta;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: string;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  fuente: string | null;
  notas: string | null;
  activa: boolean;
  tramos: RouteTramo[];
  created_at: string;
  updated_at: string;
}

export type RouteListResponse = ListResponse<Route>;
