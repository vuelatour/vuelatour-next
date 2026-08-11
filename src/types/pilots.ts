import type { ListResponse } from "./aircraft";
import type { EstadoUsuario } from "./me";
import type { User } from "./users";

export interface PilotStats {
  vuelos_mes: number;
  vuelos_proximos: number;
  capturas_mes: number;
  gastos_mes: number;
  /** Horas voladas del mes (por tramo, hora Cancún). Ausente con API viejo. */
  horas_mes?: number;
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
  fecha_fin?: string | null;
  cobrado: boolean;
  /** Rol del piloto en ese vuelo: PILOTO | COPILOTO | APOYO | TRAMO. */
  rol?: string;
}

export interface PilotDescanso {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
}

/** Pagos al piloto EXTERNO: gastos categoría PILOTO_EXTERNO de sus vuelos. */
export interface PilotHonorarios {
  total_usd: number;
  mes_usd: number;
  sin_tc_mxn: number;
  recientes: {
    id: string;
    monto: number;
    moneda: string;
    fecha_gasto: string;
    vuelo_id: string | null;
    folio: number | null;
  }[];
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
  stats: PilotStats & {
    /** Mes consultado (YYYY-MM): las stats corresponden a ESTE mes. */
    mes?: string;
    total_cobrado_mes_usd: number;
    /** Cobros MXN del mes sin TC (excluidos del total — nunca en silencio). */
    cobrado_sin_tc_mxn?: number;
    horas_mes?: number;
    horas_limite?: number;
    horas_restantes?: number;
  };
  vuelos_proximos: PilotFlightSummary[];
  vuelos_completados_mes: PilotFlightSummary[];
  gastos_recientes: PilotExpense[];
  capturas_recientes: PilotCapture[];
  fondos: PilotFondo[];
  descansos_proximos?: PilotDescanso[];
  honorarios?: PilotHonorarios | null;
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
