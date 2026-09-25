/**
 * HOJA INTERNA de la cotización — espejo EXACTO del payload que arma el API
 * para el PDF «Cotización interna» (`CotizacionInternaPdfRequest` de
 * `pyservices.service.ts`) y que desde el 22-sep-2026 también sirve en JSON:
 * `GET /v1/quotes/:id/interno` (roles ADMIN/COORDINADOR/FACTURACION/ANALISTA;
 * SOCIO ⇒ 403).
 *
 * Por qué existe: la pantalla del cotizador pasa a verse como la hoja INTERNA
 * (pedido del cliente del 22-sep-2026), y lo que ahí se pinta tiene que ser
 * EXACTAMENTE lo que se imprime. El panel NO recalcula ninguno de estos
 * números: los lee. Lo que se edita en vivo (tramos, extras, T.C., IVA) sale
 * del `breakdown` de `POST /v1/quotes/calculate`; lo que es identidad o
 * historia (quién cotizó, piloto, avión utilizado, cobros con su «Registró»)
 * sale de aquí.
 *
 * TODO es opcional en la práctica: con un API previo la lectura devuelve
 * `null` (ver `getQuoteInterno`) y la hoja se pinta solo con el breakdown.
 */

/** Tramo COTIZADO del snapshot, ya costeado por `tramos-costeados.util` del API. */
export interface CotizacionInternaTramo {
  /** Numeración 1..N de la tabla. */
  orden: number;
  /** «Cancun-Merida» (ciudad del catálogo → nombre → IATA). */
  ruta: string;
  origen_iata: string;
  destino_iata: string;
  origen_nombre: string;
  destino_nombre: string;
  /** Día del tramo YYYY-MM-DD (pared Cancún). */
  fecha: string | null;
  millas: number | null;
  /** Horas COBRABLES del tramo, con calzos incluidos. */
  tiempo_hr: number;
  /** LEGADO: el mismo tiempo como «01:18». Ya no se pinta (API 0.0.33). */
  tiempo_hhmm: string;
  /** «TIEMPO VUELO (HRS)» (API 0.0.33): «1.19»; `null` = sin tiempo («—»). Ausente con un API previo. */
  tiempo_horas?: string | null;
  tarifa_hora_usd: number | null;
  /** `snapshot.tramos[].total_usd` o `round2(tiempo_hr × tarifa)` — lo decide el API. */
  total_usd: number;
  pax: number | null;
  es_ferry: boolean;
  pernocta: boolean;
  pernocta_usd: number;
  tuas_usd: number;
  /** Fila ÚNICA de respaldo (snapshot sin desglose por tramo). */
  consolidado: boolean;
}

/** TUA COBRADA (las exentas no viajan). */
export interface CotizacionInternaTuaCobrada {
  iata: string;
  pax: number;
  /** Monto por pax en moneda NATIVA. */
  unitario: number;
  moneda: string;
  total_nativo: number;
  tc_aplicado: number | null;
  total_usd: number;
}

/** Línea del desglose canónico v1.3 enriquecida con la operación que la produjo. */
export interface CotizacionInternaLinea {
  clave: string;
  concepto: string;
  monto_usd: number;
  cantidad?: number;
  unitario?: number;
  moneda?: string;
  monto_nativo?: number;
  tc_aplicado?: number | null;
  aplica_iva?: boolean;
}

/** Un cobro del vuelo (partes de sobre de grupo incluidas). */
export interface CotizacionInternaCobro {
  fecha: string | null;
  metodo: string;
  metodo_label: string;
  /** BRUTO que pagó el cliente (negativo = reembolso). */
  monto: number;
  moneda: string;
  tc: number | null;
  /** Equivalente USD por `cobrosEnUsd`; null = MXN sin ningún T.C. */
  monto_usd: number | null;
  comision_pct: number | null;
  comision_monto: number | null;
  neto: number;
  referencia: string | null;
  cuenta_destino: string | null;
  notas: string | null;
  conciliado: boolean;
  es_reembolso: boolean;
  sobre_grupo_folio: string | null;
  sobre_grupo_monto_total: number | null;
  sobre_grupo_moneda: string | null;
  grupo_factor: number | null;
  /**
   * Nombre de quién registró el cobro (22-sep-2026). El API lo resuelve en
   * lote; el panel NUNCA deduce un nombre de un uuid.
   */
  registrado_por: string | null;
}

/** Payload íntegro de `GET /v1/quotes/:id/interno`. */
export interface CotizacionInterna {
  // ---- (1) Cabecera ----
  folio: string;
  version: number | null;
  estado: string;
  estado_label: string;
  tipo: string | null;
  cliente: string;
  razon_social: string | null;
  cliente_rfc: string | null;
  es_broker: boolean;
  /** FECHA PROTAGONISTA: día del vuelo YYYY-MM-DD (pared Cancún). */
  fecha_vuelo: string | null;
  fecha_vuelo_fin: string | null;
  /** Fecha de COTIZACIÓN (ISO). */
  fecha: string | null;
  fecha_confirmacion: string | null;
  tarifa_tipo: string | null;
  tarifa_tipo_label: string | null;
  tarifa_hora_usd: number | null;
  tarifa_override: boolean;
  tarifa_preferencial: boolean;
  metodo_cobro: string | null;
  metodo_cobro_detalle: string | null;
  metodo_cobro_label: string | null;
  tc_usd_mxn: number | null;
  vendedor: string | null;
  /** Quién CREÓ la cotización (`vuelo.created_by` → nombre). */
  cotizado_por: string | null;
  aeronave_cotizada_modelo: string | null;
  aeronave_cotizada_matricula: string | null;
  aeronave_utilizada: { matricula: string | null; modelo: string | null } | null;
  /** Lo decide el API comparando por ID (dos aviones comparten modelo). */
  aeronave_cotizada_vs_utilizada_difiere: boolean;
  avion_externo: string | null;
  operador_externo: string | null;
  piloto: string | null;
  copiloto: string | null;
  apoyos: string[];
  pasajeros: number;
  ruta: string | null;
  itinerario_operativo: boolean;
  cotizacion_abierta: boolean;
  es_interno: boolean;
  es_externo: boolean;
  grupo_folio: string | null;
  grupo_posicion: number | null;
  grupo_total_aviones: number | null;
  combinado_con_folio: string | null;

  // ---- (2) Tramos cotizados y horas ----
  tramos_cotizados: CotizacionInternaTramo[];
  tramos_tiempo_total_hr: number;
  /** LEGADO «02:36»: ya no se pinta (API 0.0.33). */
  tramos_tiempo_total_hhmm: string;
  /** Fila TOTAL de «TIEMPO VUELO (HRS)» (API 0.0.33): «2.38». Ausente con un API previo. */
  tramos_tiempo_total_horas?: string | null;
  tramos_total_usd: number;
  /** Línea TIEMPO_VUELO canónica − Σ tramos (0 si cuadra). */
  tramos_ajuste_usd: number;
  tramos_ajuste_motivo: string | null;
  horas_cotizadas_hr: number | null;
  vuelo_hr: number | null;
  calzos_hr: number | null;
  sobrevuelo_hr: number | null;
  tiempo_cobrable_hr: number | null;
  hora_minima_aplicada: boolean;
  cobrable_override: boolean;

  // ---- (3) Desglose interno ----
  lineas: CotizacionInternaLinea[];
  tuas_cobradas: CotizacionInternaTuaCobrada[];
  subtotal_vuelo_usd: number;
  tuas_usd: number;
  extras_total_usd: number;
  viaticos_pernocta_usd: number;
  comision_vendedor_usd: number;
  comision_vendedor_nombre: string | null;
  comision_vendedor_modo: string | null;
  comision_vendedor_tarifa_hr: number | null;
  iva_comision_vendedor_usd: number;
  pago_vendedor_usd: number | null;
  ajuste_final_usd: number;
  descuento_usd: number | null;
  redondeo_auto_usd: number | null;
  total_pactado_usd: number | null;
  comision_billpocket_pct: number | null;
  subtotal_usd: number;
  /** Porcentaje (16, no 0.16). */
  iva_pct: number;
  iva_base_usd: number | null;
  iva_usd: number;
  iva_nota: string | null;
  total_usd: number;
  total_mxn: number | null;
  mxn_nativos: number | null;
  version_motor: string | null;
  calculado_at: string | null;

  // ---- (4) Cobros ----
  cobros: CotizacionInternaCobro[];
  total_cobrado_usd: number;
  cobros_sin_tc_count: number;
  cobros_sin_tc_mxn: number;
  comision_banco_usd: number;
  total_cobrado_neto_usd: number | null;
  saldo_usd: number;
  cobrado_flag: boolean;
  semaforo_cobro: "verde" | "amarillo" | "rojo" | "gris";
  semaforo_cobro_key: string;
  semaforo_cobro_label: string;

  // ---- (5) Notas ----
  notas_cliente: string | null;
  notas_internas: string | null;

  // ---- (6) Pie ----
  generado: string;
  /** «YYYY-MM-DD HH:mm» ya en hora Cancún. */
  generado_cancun: string;
  generado_por: string | null;
}
