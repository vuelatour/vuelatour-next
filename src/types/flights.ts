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
  /** Copiloto del viaje (segundo piloto): ve todo el vuelo igual que el piloto. */
  copiloto_id: string | null;
  /** Apoyo en tierra: va al aeropuerto a apoyar (maletas, pagos, cobros,
      gastos). Ve el vuelo como el piloto en su app pero NO captura
      tacómetros. Opcional-defensivo: filas/respuestas viejas no lo traen. */
  apoyo_id?: string | null;
  ruta_id: string | null;
  tipo: "REDONDO" | "MULTIESCALA";
  estado: EstadoVuelo;
  es_externo: boolean;
  operador_externo: string | null;
  costo_externo_usd: string | null;
  /** Ficha del avión AJENO (externo). Opcional-defensivo para respuestas de
      APIs previas al despliegue (el detalle cae a la cotización si falta). */
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  /** Vuelo COMBINADO (estrategia de pernocta): id del vuelo ligado — se
      cancelaron los dos ferries y comparten avión; los precios de ambos
      clientes NO cambian. Opcional-defensivo (respuestas previas al deploy). */
  combinado_con_id?: string | null;
  /** Join del vuelo ligado (PostgREST puede mandarlo como arreglo). */
  combinado?: { folio: number } | { folio: number }[] | null;
  /** Método de cobro pactado (define si entra a Facturas antes de cobrar). */
  metodo_cobro?: MetodoPago | null;
  cotizacion_version: number;
  origen_iata: string;
  destino_iata: string;
  /** Ruta COMPLETA (origen → escalas → destino), p. ej. ["CUN","CTM","CUN"]. */
  ruta_iatas?: string[];
  pasajeros: number;
  monto_total_usd: string;
  /** Nombres de los pasajeros (manifiesto, para tramitar permisos). */
  pasajeros_nombres?: string[];
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  fecha_vuelo: string | null;
  fecha_traslado_final: string | null;
  /** Fin real del viaje (derivada por trigger: GREATEST de tramos/traslado final). */
  fecha_fin: string | null;
  fecha_confirmacion: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  /** PATH en el bucket privado planes-vuelo (filas viejas: URL completa).
      NO sirve como href — firmar vía getFlightPlanUrl(). */
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
  /** Manifiesto de nombres de ESTE tramo (por escala, puede ir vacío). */
  pasajeros_nombres?: string[];
  es_ferry: boolean;
  /** Tramo de sobrevuelo (recorrido sobre una zona, no un traslado normal). */
  es_sobrevuelo?: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: "NORMAL" | "SERVICIO";
  servicio_notas: string | null;
  /** true = tramo operativo interno (no cotizado/cobrado, no visible al cliente). */
  solo_operativa: boolean;
  taco_salida: string | null;
  taco_llegada: string | null;
  /** Procedencia de cada lectura: PILOTO | IA | DEDUCIDO | OFICINA. DEDUCIDO
   * es provisional del sistema (no evidencia de que el tramo voló). */
  taco_salida_origen?: "PILOTO" | "IA" | "DEDUCIDO" | "OFICINA" | null;
  taco_llegada_origen?: "PILOTO" | "IA" | "DEDUCIDO" | "OFICINA" | null;
  foto_taco_salida_url: string | null;
  foto_taco_llegada_url: string | null;
  /** Tramo CANCELADO (no voló): fuera de horas, completitud y calendario. */
  cancelada_at?: string | null;
  cancelada_motivo?: string | null;
  cancelada_por?: string | null;
  valor_ia_propuesto: string | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  /** Bitácora "cómo se registró la lectura" (el API la manda aparte del motivo). */
  procedencia?: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  capturado_offline: boolean;
  sincronizado_at: string | null;
  capturado_por: string | null;
  corregido_por: string | null;
  /** Nombres resueltos por el API para la procedencia de la lectura. */
  capturado_por_nombre?: string | null;
  corregido_por_nombre?: string | null;
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
  /** % comisión del banco sobre este cobro (null = sin comisión). */
  comision_banco_pct?: string | null;
  /** Comisión en la moneda del cobro; el banco depositó monto − esto. */
  comision_banco_monto?: string | null;
  referencia: string | null;
  /** A qué cuenta llegó el cobro (texto libre; solo métodos bancarios). */
  cuenta_destino?: string | null;
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
  /** Nombre del apoyo en tierra, resuelto por el backend en snapshot(). */
  apoyo_nombre?: string | null;
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

/** Folio del vuelo ligado por combinación (tolera el join objeto o arreglo). */
export function combinadoFolio(v: {
  combinado?: { folio: number } | { folio: number }[] | null;
}): number | null {
  const c = v.combinado;
  const x = Array.isArray(c) ? c[0] : c;
  return x?.folio ?? null;
}
