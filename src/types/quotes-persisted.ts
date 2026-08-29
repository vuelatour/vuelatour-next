import type { ListResponse } from "./aircraft";
import type { ExtraConcepto } from "./quote";
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
  /** Manifiesto de nombres de ESTE tramo (por escala, puede ir vacío). */
  pasajeros_nombres?: string[];
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: "NORMAL" | "SERVICIO";
  servicio_notas: string | null;
  solo_operativa?: boolean;
  fecha_salida_plan: string | null;
  taco_salida: string | null;
  taco_llegada: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  notas: string | null;
  /** Tramo CANCELADO (no voló): fuera de horas/completitud. */
  cancelada_at?: string | null;
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

/**
 * Participación de cada AVIÓN en la venta del avión de un vuelo MULTI-AVIÓN
 * (regla 28-ago-2026: ida en un avión y regreso en otro ⇒ la venta, sus
 * cobros, su pendiente y sus horas cobradas se reparten en PARTES IGUALES
 * POR TRAMO VENDIDO; los tramos operativos —ferry/posicionamiento— no
 * reparten). La calcula el API con la fuente única `participacionPorAeronave`
 * (+ `repartirUsd` para los montos); el panel SOLO la muestra. En vuelos de
 * un solo avión viene un elemento con factor 1.
 */
export interface ParticipacionAvion {
  aeronave_id: string;
  matricula: string | null;
  /** Fracción (0, 1] de la venta del avión; Σ == 1 exacto. */
  factor: number;
  /** Tramos VENDIDOS activos que voló este avión. */
  tramos: number;
  /** Reservado: el reparto es por tramo, no por horas → llega null o falta. */
  horas?: number | null;
  /**
   * Parte de la venta del avión (USD) que le toca, repartida por el API en
   * centavos por residuo mayor (Σ == venta del avión exacta). ADITIVO: el
   * API previo no lo manda → el panel muestra solo porcentajes. Nunca
   * calcular monto × factor en el panel (descuadra centavos vs el Excel).
   */
  venta_avion_usd?: number;
}

/** De dónde salieron los pesos: `unico` (un solo avión) o `tramos` (partes
 *  iguales por tramo vendido). El API no emite otra fuente. */
export type ParticipacionFuente = "unico" | "tramos";

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
  /** Costo del externo en USD (canon DERIVADO por el API; fuente única para
      sumar/comparar). Con moneda MXN es monto ÷ tc. */
  costo_externo_usd: Decimal | null;
  /** Costo NATIVO capturado (29-ago: puede ser MXN). Opcional-defensivo:
      respuestas del API previo no lo traen — caer a costo_externo_usd. */
  costo_externo_monto?: Decimal | null;
  costo_externo_moneda?: "USD" | "MXN" | null;
  /** TC MXN/USD con el que se derivó el USD cuando la moneda es MXN. */
  costo_externo_tc?: Decimal | null;
  /** Ficha del avión AJENO (externo sin avión de la flota): sale en el PDF. */
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  /** Vuelo COMBINADO (estrategia de pernocta): id del vuelo ligado — se
      cancelaron los dos ferries y comparten avión; los precios de ambos
      clientes NO cambian. Opcional-defensivo (respuestas previas al deploy). */
  combinado_con_id?: string | null;
  /** Join del vuelo ligado (PostgREST puede mandarlo como arreglo). */
  combinado?: { folio: number } | { folio: number }[] | null;

  cotizacion_version: number;

  origen_iata: string;
  destino_iata: string;
  /** Ruta COMPLETA (origen → escalas → destino), p. ej. ["CUN","CTM","CUN"]. */
  ruta_iatas?: string[];
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
  viaticos_pernocta_usd?: Decimal;
  extras_total_usd?: Decimal;
  ajuste_final_usd?: Decimal;
  tc_usd_mxn: Decimal | null;
  monto_total_mxn: Decimal | null;

  metodo_cobro: MetodoPago | null;
  /** Nombre manual del método cuando metodo_cobro = OTRO. */
  metodo_cobro_detalle?: string | null;
  pago_anticipado_req: boolean;
  /** Nombres de los pasajeros (manifiesto, para tramitar permisos). */
  pasajeros_nombres?: string[];
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  /** PDF: mostrar la tarifa por hora en el desglose (default apagado). */
  pdf_mostrar_tarifa?: boolean;
  /** PDF: mostrar la tabla del itinerario (default prendido). */
  pdf_mostrar_itinerario?: boolean;
  /** true = las escalas del vuelo son el itinerario OPERATIVO (lo vuela el
   *  piloto); el cotizador no las gestiona — la ruta comercial es aparte. */
  itinerario_operativo?: boolean;
  /** Conceptos extra de la cotización. */
  extras?: ExtraConcepto[];

  fecha_solicitud: string;
  fecha_vuelo: string | null;
  fecha_traslado_final: string | null;
  /** Fin real del viaje (derivada por trigger: GREATEST de tramos/traslado final). */
  fecha_fin: string | null;
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
  /**
   * Partición del ingreso (regla 28-ago, la manda el API con la fuente
   * única particionIngresoVuelo): venta del AVIÓN (tiempo + ajuste + su
   * IVA → balance del avión) vs ingreso de VUELATOUR (TUAs/extras/pernocta/
   * comisión del vendedor + su IVA → "Otros movimientos" del balance
   * general). `comision_vendedor_usd` informa el monto pre-IVA de la
   * comisión, que desde el 28-ago-2026 (tarde) vive DENTRO de vuelatour_usd
   * (es ingreso de VuelaTour, como un extra; su pago al vendedor es egreso
   * de VuelaTour, no del avión). Opcional: respuestas previas no la traen.
   */
  particion_ingreso?: {
    total_usd: number;
    avion_usd: number;
    vuelatour_usd: number;
    iva_avion_usd: number;
    iva_vuelatour_usd: number;
    tiempo_usd: number;
    ajuste_usd: number;
    comision_vendedor_usd: number;
    tuas_usd: number;
    extras_usd: number;
    pernocta_usd: number;
    /**
     * PAGO al vendedor = comisión + su IVA cuando grava (fuente única del
     * API, `pagoVendedorUsd`). ADITIVO: respuestas previas no lo traen →
     * la card muestra la comisión pre-IVA como siempre.
     */
    pago_vendedor_usd?: number | null;
    /**
     * Total − pago al vendedor (comisión + IVA): lo que queda a VuelaTour.
     * Misma regla que el reporte por vuelo. ADITIVO: sin él se usa
     * `meta.neto_vuelatour_usd` (total − comisión pre-IVA, del motor).
     */
    neto_vuelatour_usd?: number | null;
    fuente: "desglose" | "columnas" | "sin_precio";
    inconsistente: boolean;
  } | null;
  /**
   * Vuelo MULTI-AVIÓN (regla 28-ago-2026): cómo se reparte la venta del
   * avión entre los aviones de sus tramos. Aditivo: el API previo no lo
   * manda; con un solo avión trae un elemento con factor 1 (o falta).
   */
  participacion_aviones?: ParticipacionAvion[];
  participacion_fuente?: ParticipacionFuente;

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
  viaticos_pernocta_usd?: Decimal;
  extras_total_usd?: Decimal;
  tc_usd_mxn: Decimal | null;
  metodo_cobro: MetodoPago | null;
  /** Nombre manual del método cuando metodo_cobro = OTRO. */
  metodo_cobro_detalle?: string | null;
  calculo_snapshot: QuoteBreakdown | null;
  motivo: string | null;
  created_at: string;
  created_by: string | null;
}

export type PersistedQuoteListResponse = ListResponse<PersistedQuote>;
