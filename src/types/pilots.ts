import type { ListResponse } from "./aircraft";
import type { EstadoUsuario } from "./me";
import type { User } from "./users";

export interface PilotStats {
  vuelos_mes: number;
  vuelos_proximos: number;
  capturas_mes: number;
  gastos_mes: number;
  ultimo_vuelo: string | null;
}

export interface PilotListItem extends User {
  stats: PilotStats;
}

export interface PilotFlightSummary {
  id: string;
  folio: number | string;
  estado: string;
  origen_iata: string;
  destino_iata: string;
  pasajeros: number;
  monto_total_usd: number;
  fecha_vuelo: string | null;
  cobrado: boolean;
}

export interface PilotExpense {
  id: string;
  categoria: string;
  monto: number;
  moneda: "MXN" | "USD";
  fecha_gasto: string;
  foto_url: string | null;
  vuelo_id: string | null;
  aeronave_id: string | null;
  created_at: string;
}

export interface PilotCapture {
  id: string;
  vuelo_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  taco_salida: number | null;
  taco_llegada: number | null;
  sincronizado_at: string | null;
  capturado_offline: boolean;
}

export interface PilotFondo {
  id: string;
  tipo: string;
  medio_pago_asociado: string;
  monto_asignado: number;
  moneda: "MXN" | "USD";
  activo: boolean;
}

export interface PilotDetail extends User {
  stats: PilotStats & { total_cobrado_mes_usd: number };
  vuelos_proximos: PilotFlightSummary[];
  vuelos_completados_mes: PilotFlightSummary[];
  gastos_recientes: PilotExpense[];
  capturas_recientes: PilotCapture[];
  fondos: PilotFondo[];
}

export type PilotsListResponse = ListResponse<PilotListItem>;

export interface InvitePilotInput {
  nombre: string;
  email: string;
  telefono?: string;
  tarjeta_terminacion?: string;
  es_piloto_externo?: boolean;
  tiene_fondo_caja?: boolean;
  estado?: EstadoUsuario;
}
