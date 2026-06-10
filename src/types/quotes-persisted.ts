import type { ListResponse } from "./aircraft";
import type { MetodoPago, QuoteBreakdown, TipoTarifa } from "./quote";

export type TipoVuelo = "REDONDO" | "MULTIESCALA";

export interface PersistedEscala {
  id: string;
  vuelo_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: string | null;
  // Detalle por tramo.
  pasajeros: number | null;
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: "NORMAL" | "SERVICIO";
  servicio_notas: string | null;
  fecha_salida_plan: string | null;
  taco_salida: string | null;
  taco_llegada: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  notas: string | null;
}
export type EstadoVuelo =
  | "RESERVA"
  | "SOLICITUD"
  | "COTIZADO"
  | "CONFIRMADO"
  | "EN_VUELO"
  | "COMPLETADO"
  | "CANCELADO";

type Decimal = string;

export interface PersistedQuote {
  id: string;
  folio: number;
  cliente_id: string;
  aeronave_id: string | null;
  piloto_id: string | null;
  ruta_id: string | null;

  tipo: TipoVuelo;
  estado: EstadoVuelo;
  es_externo: boolean;
  operador_externo: string | null;
  costo_externo_usd: Decimal | null;

  cotizacion_version: number;

  origen_iata: string;
  destino_iata: string;
  millas_nauticas_one_way: Decimal | null;
  es_redondo_auto: boolean;
  num_aterrizajes: number;

  pasajeros: number;
  pase_abordar: boolean;

  tiempo_cobrable_hr: Decimal;
  tarifa_tipo: TipoTarifa;
  tarifa_hora_usd: Decimal;
  subtotal_vuelo_usd: Decimal;
  tuas_usd: Decimal;
  iva_pct: Decimal;
  iva_usd: Decimal;
  monto_total_usd: Decimal;
  tc_usd_mxn: Decimal | null;
  monto_total_mxn: Decimal | null;

  metodo_cobro: MetodoPago | null;
  pago_anticipado_req: boolean;
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;

  fecha_solicitud: string;
  fecha_vuelo: string | null;
  fecha_traslado_final: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  fecha_confirmacion: string | null;
  fecha_cancelacion: string | null;
  motivo_cancelacion: string | null;

  google_calendar_id: string | null;

  facturado: boolean;
  cobrado: boolean;

  notas: string | null;
  notas_internas: string | null;
  calculo_snapshot: QuoteBreakdown | null;

  /** Solo presente cuando se consulta por id (GET /v1/quotes/:id). */
  escalas?: PersistedEscala[];

  created_at: string;
  updated_at: string;
}

export interface CotizacionVersion {
  id: string;
  vuelo_id: string;
  version: number;
  aeronave_id: string | null;
  ruta_id: string | null;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas_one_way: Decimal | null;
  es_redondo_auto: boolean | null;
  num_aterrizajes: number | null;
  pasajeros: number;
  pase_abordar: boolean | null;
  tiempo_cobrable_hr: Decimal;
  tarifa_tipo: TipoTarifa;
  tarifa_hora_usd: Decimal;
  subtotal_vuelo_usd: Decimal;
  tuas_usd: Decimal | null;
  iva_pct: Decimal | null;
  iva_usd: Decimal | null;
  monto_total_usd: Decimal;
  tc_usd_mxn: Decimal | null;
  metodo_cobro: MetodoPago | null;
  calculo_snapshot: QuoteBreakdown | null;
  motivo: string | null;
  created_at: string;
  created_by: string | null;
}

export type PersistedQuoteListResponse = ListResponse<PersistedQuote>;
