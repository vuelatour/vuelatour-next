import type { ListResponse } from "./aircraft";

export interface Airport {
  id: string;
  iata: string;
  icao: string | null;
  nombre: string;
  ciudad: string | null;
  pais: string;
  latitud: number | null;
  longitud: number | null;
  tuas_default_usd_pax: string;
  tuas_aplica_xa: boolean;
  tuas_aplica_xb: boolean;
  tuas_aplica_n: boolean;
  tuas_pase_abordar_exenta: boolean;
  requiere_permiso: boolean;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type AirportListResponse = ListResponse<Airport>;
