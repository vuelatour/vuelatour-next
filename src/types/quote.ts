export type TipoTarifa = "PUBLICO" | "BROKER";
export type MetodoPago =
  | "BILLPOCKET"
  | "HSBC_LINK"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "EFECTIVO"
  | "DOLARES"
  /** Método MANUAL (solo oficina): el nombre va en metodo_pago_detalle. */
  | "OTRO";
export type PaisAeronave = "MX" | "USA";

export type TipoVuelo = "REDONDO" | "MULTIESCALA";
export type TipoParada = "NORMAL" | "SERVICIO";

/** Modalidad de la comisión del vendedor: monto fijo o tarifa × horas cobradas. */
export type ComisionVendedorModo = "FIJA" | "POR_HORA";

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
  // pdf_oculto se retiró del payload (1-sep): la visibilidad en PDF se cambia
  // por escala desde el DETALLE (PATCH pdf-visibilidad) y el API conserva el
  // valor cuando el cotizador guarda sin la bandera.
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
  /** Eco CONGELADO del snapshot (27-ago). La verdad viva es
   *  escala.pdf_oculto (toggle en el detalle); esto es solo fallback para
   *  snapshots sin escala viva de ese orden (misma regla que el PDF). */
  pdf_oculto?: boolean;
}

export interface CalculateQuoteRequest {
  /** Requerida SIEMPRE: en externos es la referencia de tarifa con la que se
   *  cotiza (el vuelo persiste sin avión propio; la referencia vive en el
   *  snapshot del cálculo). */
  aeronave_id: string;
  /** Vuelo CUBIERTO por operador externo (también en el preview /calculate). */
  es_externo?: boolean;
  /** Ficha del avión AJENO (venta broker): sale en el PDF del cliente. */
  avion_externo_modelo?: string;
  avion_externo_matricula?: string;
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
  /** COBRABLE pactado (hr): sustituye la suma final (regla del mínimo incl.). */
  tiempo_cobrable_override_hr?: number;
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  /** PDF: mostrar tarifa por hora (default apagado). */
  pdf_mostrar_tarifa?: boolean;
  /** PDF: mostrar la tabla del itinerario (default prendido). */
  pdf_mostrar_itinerario?: boolean;
  /** Conceptos extra (se suman al total; los gravados entran a la base de IVA). */
  extras?: ExtraConcepto[];
  /** Ajuste final: negativo = descuento, positivo = redondeo. Fuera de IVA. */
  ajuste_final_usd?: number;
  /** Redondeo automático del total al siguiente múltiplo de $10 (siempre arriba). */
  redondeo_automatico?: boolean;
  /**
   * LEGADO (2-sep-2026): la captura se eliminó del cotizador. Solo viaja
   * como rehidratación del pactado ya persistido de folios viejos — el API
   * lo descarta al crear y lo ancla a lo persistido al revisar.
   */
  total_pactado_usd?: number;
  metodo_pago: MetodoPago;
  /** Nombre MANUAL del método cuando metodo_pago = OTRO (ej. "PayPal"). */
  metodo_pago_detalle?: string;
  /** TC MXN por USD pactado (pago en pesos). Persiste tc_usd_mxn + monto_total_mxn. */
  tc_usd_mxn?: number;
  /** Comisión BillPocket en % (custom, tope 20). Solo con metodo_pago=BILLPOCKET. */
  comision_billpocket_pct?: number;
  /**
   * Comisión del VENDEDOR (interna): se SUMA al precio del cliente — el neto
   * VuelaTour queda en el precio base. Con IVA, la comisión también lo genera.
   * FIJA (default): viaja comision_vendedor_usd. POR_HORA: viaja la tarifa y
   * el motor resuelve comisión = tarifa × horas cobradas.
   */
  comision_vendedor_modo?: ComisionVendedorModo;
  /** Tarifa $/hr del vendedor (solo modo POR_HORA). */
  comision_vendedor_tarifa_hr?: number;
  /** Monto de la comisión en USD (solo modo FIJA, el default). */
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
  /** id nullable solo por snapshots LEGADOS del modo sin-avión (retirado
   *  29-ago; 0 filas en prod): el motor actual siempre resuelve un avión. */
  aeronave: {
    id: string | null;
    matricula: string | null;
    modelo: string | null;
    pais_registro: PaisAeronave | null;
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
    /** Lo que daría la REGLA (mínimo 1 hr incl.) cuando el cobrable viene pactado. */
    cobrable_hr_regla?: number;
    cobrable_proviene_de_override?: boolean;
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
    /**
     * Comisión del vendedor EFECTIVA en USD (interna): se SUMA al precio del
     * cliente. En POR_HORA es tarifa × horas cobradas ya resuelta por el motor.
     */
    comision_vendedor_usd?: number | null;
    /** Modalidad capturada (FIJA default; POR_HORA = tarifa × horas). */
    comision_vendedor_modo?: ComisionVendedorModo | null;
    /** Tarifa $/hr capturada (solo POR_HORA). */
    comision_vendedor_tarifa_hr?: number | null;
    comision_vendedor_nombre?: string | null;
    /** Total − comisión del vendedor: lo que queda a VuelaTour (reparto/reportes). */
    neto_vuelatour_usd?: number | null;
    /** Redondeo automático a número cerrado: si aplicó, cuánto agregó y el descuento base. */
    redondeo_automatico?: boolean | null;
    redondeo_auto_usd?: number | null;
    descuento_usd?: number | null;
    /**
     * Precio pactado (externos) — LEGADO 2-sep-2026: ya no se captura; solo
     * folios viejos lo traen y persiste para que revisar/ajustar no lo pise.
     */
    total_pactado_usd?: number | null;
  };
}
