/**
 * FACTURAS EMITIDAS (registro manual) · «Necesito factura» · comprobante del
 * cobro — 24-sep-2026.
 *
 * Tipos 1:1 con el API (`src/modules/facturas-emitidas/facturas-emitidas.types.ts`,
 * contrato §2): los NOMBRES de campo son exactos y el JSON es idéntico en los
 * dos lados. Dinero SIEMPRE `number` (el API convierte los `numeric`), días
 * `YYYY-MM-DD`, instantes ISO 8601. Aquí solo la FORMA; los textos, filtros y
 * reglas del panel viven en `lib/admin/facturas-emitidas.ts`.
 *
 * Nunca viajan paths de storage: el PDF/XML se ve con una URL firmada que se
 * pide al momento (`GET /v1/facturas-emitidas/:id/archivo-url`).
 */

export type EstatusFacturaEmitida = "VIGENTE" | "CANCELADA";
export type MonedaFactura = "MXN" | "USD";
export type MetodoPagoFactura = "PUE" | "PPD";
export type AlertaFactura = "DUPLICADO_VUELO" | "SIN_PDF" | "SIN_VUELO" | "VUELO_CANCELADO";
export type OrdenFacturas = "folio_desc" | "folio_asc" | "fecha_desc";

/** Aviso NO bloqueante (la operación ya se hizo o se puede hacer). */
export interface AvisoFactura {
  code:
    | "VUELO_CON_OTRA_FACTURA"
    | "EMISOR_NO_VUELATOUR"
    | "EMISOR_SIN_VERIFICAR"
    | "RECEPTOR_DISTINTO_CLIENTE"
    | "PDF_SIN_TEXTO"
    | "PDF_NO_LEIDO"
    | "PDF_XML_NO_CUADRAN"
    | "CAMPOS_NO_ENCONTRADOS"
    | "LECTURA_PDF"
    | "CFDI_NO_ES_INGRESO"
    | "MONEDA_NO_SOPORTADA"
    | "TOTAL_DISTINTO_VUELO"
    | "VUELO_SIGUE_FACTURADO"
    // FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API).
    | "TOTAL_DISTINTO_COBROS"
    | "COBROS_DESLIGADOS"
    | "COBROS_SIN_FACTURA";
  /** es-MX, listo para pintar. */
  mensaje: string;
  details?: Record<string, unknown>;
}

// ---- FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API) ----
//
// `cobro_vuelo.factura_emitida_id`: qué factura AMPARA cada cobro. Es
// CLASIFICACIÓN, no dinero (no toca cobrado, reparto ni balance). Todo lo de
// abajo es ADITIVO y opcional: con un API previo (o sin la migración
// `20261016000001`) las llaves no viajan y el panel no ofrece nada nuevo.

/** Por qué una factura trae la alerta DUPLICADO_VUELO («Facturas que no cuadran»). */
export type MotivoDuplicadoVuelo = "SUMA_SUPERA" | "SIN_COBRO_ASIGNADO";

export interface AlertaFacturaDetalle {
  /** Hoy solo DUPLICADO_VUELO trae detalle. */
  code: AlertaFactura;
  motivo: MotivoDuplicadoVuelo;
  vuelo_folio: number;
  /** es-MX, listo para el `title` del chip. */
  mensaje: string;
}

/** Cobro que AMPARA una factura (lista/detalle del registro). */
export interface CobroDeFactura {
  id: string;
  vuelo_id: string;
  vuelo_folio: number;
  /** BRUTO (lo que pagó el cliente, sin restar la comisión del banco). */
  monto: number;
  moneda: MonedaFactura;
  /** ISO. */
  fecha_cobro: string;
  metodo_cobro: string;
  cuenta_destino: string | null;
}

/** Cobro de un vuelo candidato (casillas del diálogo «Registrar factura»). */
export interface CobroCandidatoFactura extends CobroDeFactura {
  /** null = sin factura; {id, etiqueta} = ya amparado (por ESTA u otra). */
  factura: { id: string; etiqueta: string } | null;
}

/** Insumos del semáforo de cobro de UN vuelo (el panel pinta con SU estadoCobroSemaforo). */
export interface CobroResumen {
  monto_total_usd: number;
  /** null = el lote de cobros falló («no se sabe», nunca 0). */
  total_cobrado_usd: number | null;
  sin_tc_count: number;
  cobrado: boolean;
  cotizacion_abierta: boolean;
  estado_vuelo: string;
  es_interno: boolean;
  /** Espejo server (lo usa el Excel). El panel pinta con `estadoCobroSemaforo`. */
  semaforo: {
    key: "COBRADO" | "PARCIAL" | "SIN_COBROS" | "NO_APLICA";
    label: string;
    color: "verde" | "amarillo" | "rojo" | "gris";
    title?: string;
  };
}

export interface TotalVuelo {
  /** vuelo.monto_total_usd */
  usd: number;
  /** totalMxnDeVuelo(v) — fuente única del API. */
  mxn: number | null;
}

export interface VueloDeFactura {
  id: string;
  folio: number;
  fecha_vuelo: string | null;
  estado: string;
  cliente_nombre: string | null;
  total: TotalVuelo;
  cobro: CobroResumen;
  /** Etiquetas de OTRAS facturas VIGENTES ligadas al mismo vuelo («A-120»). */
  otras_vigentes: string[];
  /** ADITIVO (API 0.0.82): cobros de este vuelo amparados por ESTA factura. */
  cobros_n?: number;
  /** ADITIVO (API 0.0.82): cobros de este vuelo sin ninguna factura. */
  cobros_sin_factura?: number;
}

export interface FacturaEmitida {
  id: string;
  serie: string | null;
  folio: string;
  folio_num: number | null;
  /** «A-123» / «123». */
  etiqueta: string;
  uuid: string | null;
  /** YYYY-MM-DD */
  fecha_emision: string;
  estatus: EstatusFacturaEmitida;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  emisora: { id: string; razon_social: string } | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  cliente: { id: string; nombre: string } | null;
  moneda: MonedaFactura;
  subtotal: number | null;
  iva: number | null;
  total: number;
  metodo_pago: MetodoPagoFactura | null;
  forma_pago: string | null;
  notas: string | null;
  /** Anticipo / finiquito. */
  es_parcial: boolean;
  pdf: { nombre: string | null; subido_at: string | null; subido_por_nombre: string | null } | null;
  xml: { nombre: string | null; subido_at: string | null } | null;
  /** Entradas de archivos_historial (nunca se exponen paths). */
  archivos_anteriores: number;
  /** Orden fecha_vuelo asc. */
  vuelos: VueloDeFactura[];
  alertas: AlertaFactura[];
  cancelada: { at: string; por_nombre: string | null; motivo: string } | null;
  created_at: string;
  created_por_nombre: string | null;
  updated_at: string;
  /**
   * ADITIVOS (API 0.0.82): los cobros que ampara (orden vuelo_folio,
   * fecha_cobro; `[]` sin la migración) y el detalle de sus alertas (`[]` si
   * no hay). Ausentes = API previo.
   */
  cobros?: CobroDeFactura[];
  alertas_detalle?: AlertaFacturaDetalle[];
}

/** «Ya está registrada» (409 y leer-archivo). */
export interface FacturaExistente {
  id: string;
  etiqueta: string;
  uuid: string | null;
  estatus: EstatusFacturaEmitida;
  fecha_emision: string;
  vuelos: { id: string; folio: number }[];
  /** «Ya está registrada: A-123 del vuelo #297.» */
  mensaje: string;
}

export interface HuecoSerie {
  /** La numeración es por emisora; null = sin emisora identificada. */
  emisora: { id: string; razon_social: string } | null;
  /** null = sin serie. */
  serie: string | null;
  /** «A» · «(sin serie)»; con ≥2 emisoras: «A · Aero Charter Cancun». */
  etiqueta_serie: string;
  desde: number;
  hasta: number;
  /** Conteo COMPLETO. */
  total_faltantes: number;
  /** ≤ 20 etiquetas «A-104». */
  faltantes: string[];
  truncado: boolean;
}

export interface ResumenFacturas {
  registradas: number;
  vigentes: number;
  canceladas: number;
  sin_pdf: number;
  sin_vuelo: number;
  vuelos_con_varias: number;
  en_vuelo_cancelado: number;
  por_facturar: number;
  totales_vigentes: { moneda: MonedaFactura; total: number }[];
  huecos: HuecoSerie[];
}

export interface ListaFacturasEmitidas {
  data: FacturaEmitida[];
  /** Total del FILTRO. */
  count: number;
  limit: number;
  offset: number;
  /** GLOBAL (todas las no borradas, sin filtros). */
  resumen: ResumenFacturas;
  /** VIGENTES del filtro. */
  filtrado: { count: number; totales: { moneda: MonedaFactura; total: number }[] };
}

/** Campos que se leen de un PDF/XML (todos opcionales). */
export interface CamposLeidosFactura {
  serie: string | null;
  folio: string | null;
  uuid: string | null;
  fecha_emision: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  moneda: MonedaFactura | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  metodo_pago: MetodoPagoFactura | null;
  forma_pago: string | null;
}

export interface LecturaArchivoFactura {
  campos: CamposLeidosFactura;
  fuente: { xml: boolean; pdf: boolean };
  /** null = no vino PDF. */
  texto_extraido: boolean | null;
  ya_registrada: FacturaExistente | null;
  cliente_sugerido: { id: string; nombre: string; por: "RFC" | "NOMBRE" } | null;
  emisora: { id: string; razon_social: string } | null;
  avisos: AvisoFactura[];
}

/** Datos del alta/edición (van como JSON en el campo multipart `datos`). */
export interface FacturaEmitidaDatos {
  serie?: string | null;
  folio?: string;
  uuid?: string | null;
  fecha_emision?: string;
  emisor_rfc?: string | null;
  emisor_nombre?: string | null;
  emisora_id?: string | null;
  receptor_rfc?: string | null;
  receptor_nombre?: string | null;
  cliente_id?: string | null;
  moneda?: MonedaFactura;
  subtotal?: number | null;
  iva?: number | null;
  total?: number;
  metodo_pago?: MetodoPagoFactura | null;
  forma_pago?: string | null;
  notas?: string | null;
  es_parcial?: boolean;
  /** ≤50 uuids. Alta: default []. PATCH: si viene, REEMPLAZA el conjunto. */
  vuelo_ids?: string[];
  /**
   * ADITIVO (API 0.0.82): cobros que AMPARA esta factura (≤200 uuids, de sus
   * propios vuelos). Ausente = no se tocan; presente = REEMPLAZA el conjunto
   * (`[]` = el operador vio las casillas y no marcó ninguna). El panel solo lo
   * manda cuando TODOS los vuelos elegidos trajeron sus `cobros` (API nuevo).
   */
  cobro_ids?: string[];
}

export interface ResultadoGuardarFactura {
  factura: FacturaEmitida;
  avisos: AvisoFactura[];
}

// ---- Solicitud / bloque del vuelo ----
export interface SolicitudFactura {
  solicitada_at: string;
  solicitada_por: { id: string; nombre: string | null } | null;
  nota: string | null;
  paga_contra_factura: boolean;
}

export interface FacturaEmitidaMini {
  id: string;
  serie: string | null;
  folio: string;
  etiqueta: string;
  uuid: string | null;
  fecha_emision: string;
  total: number;
  moneda: MonedaFactura;
  metodo_pago: MetodoPagoFactura | null;
  tiene_pdf: boolean;
  tiene_xml: boolean;
  /**
   * ADITIVOS (API 0.0.82, en este orden): anticipo/finiquito; cobros de ESTE
   * vuelo que ampara y su Σ por moneda (BRUTO). Ausentes = API previo.
   */
  es_parcial?: boolean;
  cobros_n?: number;
  cobros_monto?: { moneda: MonedaFactura; monto: number }[];
}

/** Bloque ADITIVO `factura_servicio` del snapshot del vuelo. */
export interface FacturaServicioBloque {
  solicitud: SolicitudFactura | null;
  /** Derivado en el API (§3.8): el panel NO lo recalcula. */
  por_facturar: boolean;
  /** VIGENTES ligadas, orden serie, folio_num, folio. */
  facturas: FacturaEmitidaMini[];
  /** CANCELADAS ligadas (no borradas). */
  canceladas: number;
  /**
   * ADITIVO (13-oct-2026, caso #376): pedida, sin factura VIGENTE ligada y
   * marcada «Facturado» a mano en el vuelo — ya NO cuenta como
   * `por_facturar`. La burbuja la pinta en gris. Ausente = API previo (chip
   * ámbar de siempre).
   */
  marcado_sin_registro?: boolean;
  /**
   * ADITIVOS (14-oct-2026, API 0.0.77, invariante 60 del API), ÚLTIMAS
   * llaves y en este orden. `exigencia` la DECIDE el API (neto por cuenta y
   * moneda; un anticipo devuelto completo, por cualquier vía, NO exige —
   * decisión del cliente del 14-oct-2026—); `null` = el API no la pudo leer
   * (no se anuncia nada). Ausente = API ≤ 0.0.76: el panel usa su espejo
   * `lib/admin/factura-obligatoria.ts` (`obligatoriaDeBloque`).
   */
  exigencia?: "EXIGE" | "NO_EXIGE" | "SIN_COBROS" | null;
  /** Orígenes de lo que exige («en HSBC Pesos», «por Transferencia»): el chip. */
  origenes_exigen?: string[];
  /**
   * La solicitud viva es AUTOMÁTICA y el vuelo ya no exige factura (dinero
   * devuelto, cobro corregido o eliminado): ya no cuenta en «Por facturar»;
   * la burbuja pinta el chip gris «ya no aplica» con «Retirar». NO mira el
   * estado del vuelo (también en un cancelado). Una manual, nunca.
   */
  solicitud_ya_no_aplica?: boolean;
  /**
   * FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API),
   * ÚLTIMAS llaves y en este orden: cobros positivos del vuelo (sin sobre)
   * que ninguna factura ampara; de esos, los que EXIGEN factura por su
   * cuenta/método (deciden el tono del chip); y si el API puede asignar
   * (`asignacion_disponible` = la migración está aplicada). El panel ofrece
   * selector, casillas y chips SOLO con `asignacion_disponible: true`.
   * Ausentes = API previo.
   */
  cobros_sin_factura?: number;
  cobros_sin_factura_exigen?: number;
  asignacion_disponible?: boolean;
}

/** Campo ADITIVO por fila de GET /flights y GET /quotes. */
export interface FacturaServicioResumen {
  solicitada: boolean;
  por_facturar: boolean;
  paga_contra_factura: boolean;
  /** VIGENTES ligadas. */
  facturas: number;
}

/** Grupo multi-avión al que pertenece un vuelo (null = vuelo suelto). */
export interface GrupoDeVueloFactura {
  id: string;
  /** vuelo_grupo.folio (se pinta «G-12»). */
  folio: number | null;
  nombre: string | null;
  /** Hijos NO cancelados del grupo. */
  total_aviones: number;
}

export interface PorFacturarItem {
  vuelo: {
    id: string;
    folio: number;
    estado: string;
    fecha_vuelo: string | null;
    ruta_iatas: string[];
    es_externo: boolean;
    grupo: GrupoDeVueloFactura | null;
    /** vuelo.factura_estatus (seguimiento manual). */
    estatus_manual: "SIN_FACTURA" | "ELABORADA_ENVIADA" | "FACTURADO";
  };
  cliente: {
    id: string;
    nombre: string;
    rfc: string | null;
    razon_social: string | null;
    regimen_fiscal: string | null;
    uso_cfdi: string | null;
    codigo_postal: string | null;
    domicilio_fiscal: string | null;
    pais_residencia: string | null;
  } | null;
  /** «RFC», «Razón social», «Régimen fiscal», «Uso de CFDI», «Código postal». */
  faltan_datos_fiscales: string[];
  total: TotalVuelo;
  cobro: CobroResumen;
  solicitud: SolicitudFactura;
  facturas_canceladas: number;
  /**
   * ADITIVO (13-oct-2026, caso #376, Parte B): facturas VIGENTES del MISMO
   * cliente que NO están ligadas a este vuelo (emitidas entre la solicitud −
   * 30 días y hoy), máx. 3, recientes primero. El panel ofrece «Ligar a
   * A-0440» (con confirmación). Ausente = API previo (no se ofrece nada).
   */
  facturas_del_cliente?: FacturaDelClienteSugerida[];
}

/** Factura ya registrada del cliente que quizá también cubre ESTE vuelo. */
export interface FacturaDelClienteSugerida {
  id: string;
  /** «A-0440». */
  etiqueta: string;
  /** YYYY-MM-DD (día de pared). */
  fecha_emision: string;
  total: number;
  moneda: MonedaFactura;
  /** Vuelos a los que YA está ligada (puede ir vacía). */
  vuelo_ids: string[];
  vuelo_folios: number[];
}

export interface VueloCandidatoFactura {
  id: string;
  folio: number;
  fecha_vuelo: string | null;
  /** CANCELADO se pinta con chip (el cargo por cancelación también se factura). */
  estado: string;
  cliente_id: string;
  cliente_nombre: string | null;
  cliente_rfc: string | null;
  total: TotalVuelo;
  /** Etiquetas de sus facturas vigentes. */
  facturas_vigentes: string[];
  /** Tiene solicitud pendiente (por facturar). */
  solicitud: boolean;
  grupo: GrupoDeVueloFactura | null;
  /**
   * ADITIVO (API 0.0.82, SOLO con la migración): cobros positivos del vuelo
   * (sin sobre), orden fecha_cobro asc, cada uno con la factura que lo
   * ampara. Ausente = API previo o sin la migración: sin casillas.
   */
  cobros?: CobroCandidatoFactura[];
}

export interface ResponsablesFacturacion {
  /** Lo guardado en config. */
  usuario_ids: string[];
  /** Resolución de usuario_ids. */
  usuarios: { id: string; nombre: string; rol: string; activo: boolean }[];
  /** Oficina activa (ADMIN/COORDINADOR/FACTURACION). */
  candidatos: { id: string; nombre: string; rol: string }[];
  /** A quién le llegaría HOY el aviso (sin excluir a nadie). */
  efectivos: { id: string; nombre: string }[];
  fuente: "CONFIG" | "ROL_FACTURACION" | "ADMINS";
}

/** Respuesta de POST /v1/flights/:id/solicitud-factura. */
export interface ResultadoSolicitudFactura {
  factura_servicio: FacturaServicioBloque;
  nueva: boolean;
  /** Folios con solicitud NUEVA. */
  vuelos: number[];
  /** Nombres a quienes se persistió la notificación. */
  notificados: string[];
}

/** Respuesta de POST /v1/flights/cobros/:cobroId/comprobante. */
export interface ResultadoComprobanteCobro {
  id: string;
  foto_voucher_url: string;
  /** Firmada 600 s. */
  url: string;
  tipo: "imagen" | "pdf";
}

/** Respuesta de GET /v1/facturas-emitidas/por-facturar. */
export interface ListaPorFacturar {
  /** Solo POR FACTURAR (desde el 13-oct-2026 sin los marcados «Facturado» a mano). */
  data: PorFacturarItem[];
  count: number;
  /**
   * ADITIVO (13-oct-2026, caso #376): pedidas, sin factura VIGENTE y
   * marcadas «Facturado» a mano en el vuelo; misma forma y orden que `data`.
   * Ausente = API previo (no se pinta la segunda tarjeta).
   */
  marcados_sin_registro?: PorFacturarItem[];
  /**
   * ADITIVO (14-oct-2026, API 0.0.77): solicitudes AUTOMÁTICAS cuyo vuelo ya
   * no exige factura (anticipo devuelto, cobro corregido o eliminado); misma
   * forma y orden que `data`. No cuentan en «Por facturar»; se retiran desde
   * su tarjeta (con confirmación). Ausente = API previo (sin tercera tarjeta).
   */
  ya_no_aplican?: PorFacturarItem[];
}

/** Respuesta de GET /v1/facturas-emitidas/por-facturar/conteo. */
export interface ConteoPorFacturar {
  por_facturar: number;
  paga_contra_factura: number;
  /** ADITIVO (13-oct-2026): el badge del menú sigue leyendo SOLO `por_facturar`. */
  marcados_sin_registro?: number;
  /** ADITIVO (14-oct-2026, API 0.0.77): el badge sigue leyendo SOLO `por_facturar`. */
  ya_no_aplican?: number;
}
