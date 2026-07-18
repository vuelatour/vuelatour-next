export type TipoTarifa = "PUBLICO" | "BROKER";
export type MetodoPago =
  | "BILLPOCKET"
  | "HSBC_LINK"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "EFECTIVO"
  | "DOLARES";
export type PaisAeronave = "MX" | "USA";

export type TipoVuelo = "REDONDO" | "MULTIESCALA";
export type TipoParada = "NORMAL" | "SERVICIO";

/** Concepto extra de la cotización (handler, comisariato, extensión, etc.). */
export interface ExtraConcepto {
  concepto: string;
  /**
   * Monto NATIVO en la moneda del renglón (nombre legado: antes siempre era
   * USD). Con moneda=MXN el motor lo convierte con el TC de la cotización.
   */
  monto_usd: number;
  /** Moneda del renglón (default USD). MXN entra al total MXN en pesos tal cual. */
  moneda?: "USD" | "MXN";
  /** Eco del motor en el breakdown: monto nativo del renglón. */
  monto_nativo?: number;
  /** TC congelado con el que se convirtió un renglón MXN (null = USD puro). */
  tc_aplicado?: number | null;
  /** Si entra a la base de IVA (default true). */
  aplica_iva?: boolean;
}

/** TUA capturada POR AEROPUERTO: monto unitario editable + moneda propia. */
export interface TuaLinea {
  iata: string;
  /** Monto por pasajero en la moneda de la línea. */
  monto_pax: number;
  moneda: "USD" | "MXN";
}

/** Estado de TUA de un aeropuerto en el breakdown (catálogo o capturada). */
export interface TuasAeropuerto {
  iata: string;
  aplica: boolean;
  /** Por pasajero en USD (canon; convertido si la línea es MXN). */
  usd_pax: number;
  /** Por pasajero NATIVO en la moneda de la línea (motor ≥1.3.1). */
  monto_pax?: number;
  moneda?: "USD" | "MXN";
  /** TC congelado con el que se convirtió una línea MXN (null = USD puro). */
  tc_aplicado?: number | null;
  razon: string;
}

/** Fila CONTABLE de TUAS por aeropuerto (motor ≥1.3.1). */
export interface TuasFila {
  iata: string;
  aplica: boolean;
  moneda: "USD" | "MXN";
  /** Monto por pax NATIVO en la moneda de la línea. */
  monto_pax: number;
  usd_pax: number;
  pax: number;
  total_nativo: number;
  total_usd: number;
  tc_aplicado: number | null;
  razon: string;
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
  /** Cliente: si tiene tarifa preferencial para la aeronave, esa manda sobre la default. */
  cliente_id?: string;
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
  /** Horas de SOBREVUELO (reconocimiento/foto): se suman al tiempo cobrable. */
  sobrevuelo_hr?: number;
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  /** Conceptos extra (se suman al total; los gravados entran a la base de IVA). */
  extras?: ExtraConcepto[];
  /** Ajuste final: negativo = descuento, positivo = redondeo. Fuera de IVA. */
  ajuste_final_usd?: number;
  /** Redondeo automático del total al siguiente múltiplo de $10 (siempre arriba). */
  redondeo_automatico?: boolean;
  /** Precio TOTAL pactado (externos): el motor ajusta para aterrizar exacto. */
  total_pactado_usd?: number;
  metodo_pago: MetodoPago;
  /** TC MXN por USD pactado (pago en pesos). Persiste tc_usd_mxn + monto_total_mxn. */
  tc_usd_mxn?: number;
  /** Comisión BillPocket en % (custom, tope 20). Solo con metodo_pago=BILLPOCKET. */
  comision_billpocket_pct?: number;
  /** Comisión del VENDEDOR en USD (interna): sale del precio, no se suma al cliente. */
  comision_vendedor_usd?: number;
  comision_vendedor_nombre?: string;
  tarifa_hora_override_usd?: number;
  tuas_override_usd_pax?: number;
  /**
   * TUAS capturadas POR AEROPUERTO (monto unitario + moneda): mandan sobre el
   * catálogo y sobre tuas_override_usd_pax para ese aeropuerto.
   */
  tuas_lineas?: TuaLinea[];
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
    /** Horas de sobrevuelo solicitadas (0 si no aplica). */
    sobrevuelo_hr?: number;
    cobrable_hr: number;
    /** Vuelo corto: se facturó la hora completa (cobrable_hr = 1.0). */
    minimo_hora_aplicado?: boolean;
  };
  tarifa: {
    tipo: TipoTarifa;
    usd_por_hora: number;
    proviene_de_override: boolean;
    /** La tarifa aplicada es la preferencial pactada con el cliente para esta aeronave. */
    preferencial_cliente?: boolean;
  };
  tuas: {
    usd_pax_default: number | undefined;
    pasajeros: number;
    origen: TuasAeropuerto;
    destino: TuasAeropuerto;
    intermedios?: TuasAeropuerto[];
    aeropuertos?: TuasAeropuerto[];
    /** Filas CONTABLES por aeropuerto (unitario, moneda, pax, totales, TC). */
    filas?: TuasFila[];
    /** Líneas capturadas tal cual (para rehidratar revisiones sin perderlas). */
    lineas_capturadas?: TuaLinea[];
    total_usd: number;
    /** Suma NATIVA de las filas MXN (entra al total MXN en pesos tal cual). */
    total_mxn_nativo?: number;
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
    /**
     * TOTAL MXN EXACTO por composición (motor ≥1.3.1): componentes USD × TC +
     * renglones nativos MXN tal cual. null si no hay TC capturado.
     */
    total_mxn?: number | null;
    /** Suma de renglones NATIVOS en MXN (TUAS + extras en pesos). */
    mxn_nativos?: number;
  };
  meta: {
    calculado_at: string;
    version_motor: string;
    /** % de comisión BillPocket sintetizada por el motor (null si no aplica). */
    comision_billpocket_pct?: number | null;
    /** Comisión del vendedor (interna): no altera el total que paga el cliente. */
    comision_vendedor_usd?: number | null;
    comision_vendedor_nombre?: string | null;
    /** Total − comisión del vendedor: lo que queda a VuelaTour (reparto/reportes). */
    neto_vuelatour_usd?: number | null;
    /** Redondeo automático a número cerrado: si aplicó, cuánto agregó y el descuento base. */
    redondeo_automatico?: boolean | null;
    redondeo_auto_usd?: number | null;
    descuento_usd?: number | null;
    /** Precio pactado (externos): persiste para que revisar/ajustar no lo pise. */
    total_pactado_usd?: number | null;
  };
}
