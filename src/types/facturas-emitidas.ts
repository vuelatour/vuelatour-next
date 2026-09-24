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
    | "VUELO_SIGUE_FACTURADO";
  /** es-MX, listo para pintar. */
  mensaje: string;
  details?: Record<string, unknown>;
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
  data: PorFacturarItem[];
  count: number;
}

/** Respuesta de GET /v1/facturas-emitidas/por-facturar/conteo. */
export interface ConteoPorFacturar {
  por_facturar: number;
  paga_contra_factura: number;
}
