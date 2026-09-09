import type {
  ComisionVendedorModo,
  EscalaInput,
  ExtraConcepto,
  MetodoPago,
  TipoTarifa,
  TipoVuelo,
  TuaLinea,
} from "@/types/quote";

/**
 * Tipos del FORM del cotizador (react-hook-form) y de sus catálogos.
 * Viven aparte de `quote-calculator.tsx` (8-sep-2026, ensamble
 * form-as-document) para que la hoja (`QuoteSheet`) y el panel
 * «Interno · no se imprime» (`QuoteInternalPanel`) los importen sin ciclos.
 * Los nombres de campo son los del payload de `/calculate`: no renombrar.
 */
export interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
  pais_registro: "MX" | "USA";
  velocidad_crucero_kts: number;
  asientos: number;
  tarifa_hora_pub_usd: number | null;
  tarifa_hora_broker_usd: number | null;
}

export interface RouteOptionTramo {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  pasajeros?: number | null;
  es_ferry?: boolean;
  requiere_pernocta?: boolean;
  pernocta_costo_usd?: number | null;
  tipo_parada?: "NORMAL" | "SERVICIO";
  servicio_notas?: string | null;
}

export interface RouteOption {
  id: string;
  tipo: "SIMPLE" | "MULTIESCALA";
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  tramos: RouteOptionTramo[];
}

export interface ClientOption {
  id: string;
  nombre: string;
  es_broker: boolean;
  /** Cliente interno (operación propia): la cotización puede ir en $0. */
  es_interno?: boolean;
  rfc: string | null;
}

export interface AirportOption {
  iata: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

/**
 * Tramo de la ruta OPERATIVA (solo alta): vive en react-hook-form desde F0.5
 * (8-sep-2026) — antes era `useState` aparte y ni el borrador ?d= ni el
 * diff lo veían.
 */
export interface OpsLegForm {
  origen: string;
  destino: string;
  ferry: boolean;
  pax: string;
  hora: string; // datetime-local (hora Cancún)
  nota: string;
  pernocta: boolean;
  servicio: boolean;
  servicioNotas: string;
  /** Manifiesto: un nombre por línea (colapsado tras "+ nombres de pasajeros"). */
  nombres: string;
  showNombres: boolean;
}

export interface QuoteFormValues {
  cliente_id: string;
  tipo: TipoVuelo;
  fecha_vuelo: string;
  fecha_traslado_final: string;
  aeronave_id: string;
  ruta_id: string;
  escalas: EscalaInput[];
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar: boolean;
  /** Horas de sobrevuelo (reconocimiento/foto): se suman al tiempo cobrable. */
  sobrevuelo_hr: number | null;
  /** COBRABLE pactado (hr): sustituye la suma final de horas a cobrar. */
  tiempo_cobrable_override_hr: number | null;
  /** Switch rápido de TUAS: apagado = no se cobra (override $0/pax). */
  cobrar_tuas: boolean;
  /** TUAS capturadas POR AEROPUERTO (pass-through): mandan sobre el catálogo. */
  tuas_lineas: TuaLinea[];
  cotizacion_abierta: boolean;
  /** PDF: mostrar tarifa por hora (default apagado) e itinerario (default prendido). */
  pdf_mostrar_tarifa: boolean;
  pdf_mostrar_itinerario: boolean;
  /** Vuelo CUBIERTO por operador externo (sin avión propio ni tacómetros). */
  es_externo: boolean;
  operador_externo: string;
  /** Ficha del avión AJENO (ej. HAWKER 400 A / XA-REG): sale en el PDF. */
  avion_externo_modelo: string;
  avion_externo_matricula: string;
  /** Lo que cobra el operador externo (costo para VuelaTour) en su moneda. */
  costo_externo_monto: number | null;
  /** Moneda del costo del externo (29-ago). MXN exige TC para derivar USD. */
  costo_externo_moneda: "USD" | "MXN";
  /**
   * LEGADO (2-sep-2026): la captura del precio pactado se eliminó del
   * cotizador (sin input). El valor solo se rehidrata del snapshot en folios
   * viejos (24/69/148) para que revisar/ajustar no mueva su total acordado.
   */
  total_pactado_usd: number | null;
  /** Conceptos extra (handler, comisariato, extensión…). */
  extras: ExtraConcepto[];
  /** Redondeo AUTOMÁTICO al siguiente múltiplo de $10 (regla del cliente). */
  redondeo_auto: boolean;
  /** Redondeo manual (solo con el automático apagado). */
  redondeo_usd: number | null;
  /** Descuento negociado ("ciérramelo en 750"). Se captura en positivo. */
  descuento_usd: number | null;
  metodo_pago: MetodoPago;
  /** Nombre MANUAL del método cuando metodo_pago = OTRO. */
  metodo_pago_detalle: string;
  /** TC MXN por USD con el que entrará el pago (BillPocket/transferencia en pesos). */
  tc_usd_mxn: number | null;
  /** Comisión BillPocket % (custom por operación, tope 20). */
  comision_billpocket_pct: number | null;
  /** Modalidad de la comisión del VENDEDOR: monto fijo o $/hr × horas cobradas. */
  comision_vendedor_modo: ComisionVendedorModo;
  /** Comisión del VENDEDOR en USD (modo FIJA): se SUMA al precio del cliente. */
  comision_vendedor_usd: number | null;
  /** Tarifa $/hr del vendedor (modo POR_HORA): el motor la multiplica por las horas cobradas. */
  comision_vendedor_tarifa_hr: number | null;
  comision_vendedor_nombre: string;
  tarifa_hora_override_usd: number | null;
  tuas_override_usd_pax: number | null;
  iva_pct_override: number | null;
  notas: string;
  notas_internas: string;
  // Solo en mode='revise': texto libre del motivo (el chip vive aparte; el
  // diff lo IGNORA — no es un dato de la cotización).
  motivo: string;
  /**
   * Modo «Personalizada» del segmento de tarifa (F0.5: era `useState`). Es
   * un estado de UI pegajoso, no un dato: el diff lo ignora.
   */
  tarifa_personalizada: boolean;
  /** Ruta OPERATIVA opcional (solo alta). Vacía = usa la comercial. */
  escalas_operacion: OpsLegForm[];
}
