import type { ListResponse } from "./aircraft";
import type { MetodoPago } from "./quote";
import type { EstadoVuelo } from "./quotes-persisted";

/** Resumen para listas: el backend devuelve solo estos cols en GET /v1/flights. */
export interface FlightListItem {
  id: string;
  folio: number;
  cliente_id: string;
  aeronave_id: string | null;
  piloto_id: string | null;
  ruta_id: string | null;
  tipo: "REDONDO" | "MULTIESCALA";
  estado: EstadoVuelo;
  es_externo: boolean;
  operador_externo: string | null;
  costo_externo_usd: string | null;
  cotizacion_version: number;
  origen_iata: string;
  destino_iata: string;
  pasajeros: number;
  monto_total_usd: string;
  /** Nombres de los pasajeros (manifiesto, para tramitar permisos). */
  pasajeros_nombres?: string[];
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  fecha_vuelo: string | null;
  fecha_traslado_final: string | null;
  fecha_confirmacion: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  foto_plan_vuelo_url: string | null;
  facturado: boolean;
  cobrado: boolean;
  notas: string | null;
  notas_internas: string | null;
  google_calendar_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlightEscala {
  id: string;
  vuelo_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  // Asignación por tramo (ida/regreso independientes).
  aeronave_id: string | null;
  piloto_id: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  fecha_salida_plan: string | null;
  foto_plan_vuelo_url: string | null;
  google_calendar_id: string | null;
  // Resueltos por el backend en snapshot() para mostrar la asignación del tramo.
  aeronave_matricula?: string | null;
  piloto_nombre?: string | null;
  // Detalle por tramo.
  pasajeros: number | null;
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: "NORMAL" | "SERVICIO";
  servicio_notas: string | null;
  /** true = tramo operativo interno (no cotizado/cobrado, no visible al cliente). */
  solo_operativa: boolean;
  taco_salida: string | null;
  taco_llegada: string | null;
  foto_taco_salida_url: string | null;
  foto_taco_llegada_url: string | null;
  valor_ia_propuesto: string | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  capturado_offline: boolean;
  sincronizado_at: string | null;
  capturado_por: string | null;
  corregido_por: string | null;
  nota_correccion: string | null;
  corregido_at: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlightCobro {
  id: string;
  vuelo_id: string;
  monto: string;
  moneda: "USD" | "MXN";
  metodo_cobro: MetodoPago;
  tc_usd_mxn: string | null;
  referencia: string | null;
  fecha_cobro: string;
  foto_voucher_url: string | null;
  registrado_por: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Snapshot completo: GET /v1/flights/:id/snapshot. */
export interface FlightSnapshot extends FlightListItem {
  escalas: FlightEscala[];
  cobros: FlightCobro[];
  total_cobrado: number;
}

/** Foto de tacómetro con URL firmada: GET /v1/flights/:id/taco-photos. */
export interface TacoPhoto {
  escala_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  taco_salida: string | null;
  taco_llegada: string | null;
  valor_ia_propuesto: string | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  foto_salida_url: string | null;
  foto_llegada_url: string | null;
  capturado_at: string | null;
}

export type FlightListResponse = ListResponse<FlightListItem>;
