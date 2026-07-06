export type TipoTarifa = "PUBLICO" | "BROKER";
export type MetodoPago = "BILLPOCKET" | "HSBC_LINK" | "TRANSFERENCIA" | "EFECTIVO" | "DOLARES";
export type PaisAeronave = "MX" | "USA";

export type TipoVuelo = "REDONDO" | "MULTIESCALA";
export type TipoParada = "NORMAL" | "SERVICIO";

/** Concepto extra de la cotización (handler, comisariato, extensión, etc.). */
export interface ExtraConcepto {
  concepto: string;
  monto_usd: number;
  /** Si entra a la base de IVA (default true). */
  aplica_iva?: boolean;
}

export interface EscalaInput {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  // Detalle por tramo (opcional al enviar; el motor aplica defaults).
  pasajeros?: number | null;
  /** Nombres de pasajeros de ESTE tramo (manifiesto por escala, opcional). */
  pasajeros_nombres?: string[];
  es_ferry?: boolean;
  requiere_pernocta?: boolean;
  pernocta_costo_usd?: number | null;
  tipo_parada?: TipoParada;
  servicio_notas?: string | null;
  /** Nota operativa del tramo para el piloto (ej. "cargar gasolina aquí"). */
  notas?: string | null;
  /** Fecha/hora planeada del tramo. El 1er/último tramo heredan las fechas del vuelo si se omite. */
  fecha_salida_plan?: string | null;
}

/** Tramo resuelto que devuelve el motor en el breakdown (defaults aplicados). */
export interface TramoBreakdown {
  orden: number;
  origen: string;
  destino: string;
  millas: number;
  pasajeros: number;
  es_ferry: boolean;
  tiempo_hr: number;
  tuas_usd: number;
  requiere_pernocta: boolean;
  pernocta_usd: number;
  tipo_parada: TipoParada;
  servicio_notas: string | null;
}

export interface CalculateQuoteRequest {
  aeronave_id: string;
  tipo?: TipoVuelo;
  escalas?: EscalaInput[];
  ruta_id?: string | null;
  origen_iata?: string;
  destino_iata?: string;
  millas_nauticas?: number;
  es_redondo_auto?: boolean;
  num_aterrizajes?: number;
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar?: boolean;
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  /** Conceptos extra (se suman al total; los gravados entran a la base de IVA). */
  extras?: ExtraConcepto[];
  /** Ajuste final: negativo = descuento, positivo = redondeo. Fuera de IVA. */
  ajuste_final_usd?: number;
  metodo_pago: MetodoPago;
  /** TC MXN por USD pactado (pago en pesos). Persiste tc_usd_mxn + monto_total_mxn. */
  tc_usd_mxn?: number;
  /** Comisión BillPocket en % (custom, tope 20). Solo con metodo_pago=BILLPOCKET. */
  comision_billpocket_pct?: number;
  tarifa_hora_override_usd?: number;
  tuas_override_usd_pax?: number;
  iva_pct_override?: number;
}

export interface QuoteBreakdown {
  aeronave: {
    id: string;
    matricula: string;
    modelo: string;
    pais_registro: PaisAeronave;
    velocidad_crucero_kts: number;
  };
  ruta: {
    id: string | null;
    origen_iata: string;
    destino_iata: string;
    millas_nauticas_base: number;
    millas_nauticas_totales: number;
    es_redondo_auto: boolean;
    num_aterrizajes: number;
    escalas: EscalaInput[] | null;
  };
  tiempos: {
    vuelo_hr: number;
    calzos_hr: number;
    cobrable_hr: number;
  };
  tarifa: {
    tipo: TipoTarifa;
    usd_por_hora: number;
    proviene_de_override: boolean;
  };
  tuas: {
    usd_pax_default: number | undefined;
    pasajeros: number;
    origen: { iata: string; aplica: boolean; usd_pax: number; razon: string };
    destino: { iata: string; aplica: boolean; usd_pax: number; razon: string };
    intermedios?: { iata: string; aplica: boolean; usd_pax: number; razon: string }[];
    aeropuertos?: { iata: string; aplica: boolean; usd_pax: number; razon: string }[];
    total_usd: number;
  };
  // Desglose por tramo (null en single-leg/REDONDO simple).
  tramos: TramoBreakdown[] | null;
  /** Conceptos extra aplicados (null si no hay). */
  extras?: ExtraConcepto[] | null;
  /** Desglose canónico para el balance: las líneas suman exactamente el total. */
  desglose?: { clave: string; concepto: string; monto_usd: number }[];
  iva: {
    aplica_por_metodo_pago: boolean;
    porcentaje: number;
    base_usd: number;
    monto_usd: number;
    nota: string;
  };
  totales: {
    subtotal_vuelo_usd: number;
    tuas_total_usd: number;
    viaticos_pernocta_usd?: number;
    extras_total_usd?: number;
    ajuste_final_usd?: number;
    iva_usd: number;
    total_usd: number;
  };
  meta: {
    calculado_at: string;
    version_motor: string;
    /** % de comisión BillPocket sintetizada por el motor (null si no aplica). */
    comision_billpocket_pct?: number | null;
  };
}
