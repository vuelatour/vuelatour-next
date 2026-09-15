export type TipoMovimientoBancario = "CARGO" | "ABONO";

export interface MovimientoGasto {
  id: string;
  monto: string;
  moneda: string;
  categoria: string;
  fecha_gasto: string | null;
  proveedor?: { nombre: string | null } | null;
  /** Vuelo al que pertenece el gasto conciliado (para verificar de un clic). */
  vuelo_id?: string | null;
  vuelo?: { folio: number | null } | null;
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS): suma de los cargos ligados al
      gasto y lo que falta para cubrirlo. Sin ellos (API sin desplegar) la UI
      se comporta como hoy — leerlos SIEMPRE por `estadoParcialDeGasto`. */
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
}

export interface MovimientoBancario {
  id: string;
  cuenta_bancaria_id: string;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: string;
  descripcion: string | null;
  referencia: string | null;
  conciliado: boolean;
  gasto_id: string | null;
  cobro_id: string | null;
  /** ABONO conciliado contra el SOBRE de un grupo (cobro_grupo), excluyente
      con `cobro_id`. Aditivo (API previo no lo manda). */
  cobro_grupo_id?: string | null;
  /** Conciliado por CLASIFICACIÓN (no corresponde a ningún vuelo). */
  clasificacion_id?: string | null;
  clasificacion?: { nombre: string } | null;
  origen: string;
  notas: string | null;
  created_at: string;
  /** PASARELA (Paywise, aditivo 9-sep-2026): bruto cobrado al cliente y
      comisión retenida en este abono; `monto` sigue siendo el NETO
      depositado. null en cuentas de banco. */
  monto_bruto?: string | number | null;
  comision_monto?: string | number | null;
  gasto?: MovimientoGasto | null;
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS de la RESPUESTA de
      `PATCH /v1/conciliacion/movimientos/:id`): cómo quedó el GASTO tras
      ligar/desvincular este cargo — `gasto_conciliado` = los cargos ligados
      CUBREN su monto; `monto_vinculado` = suma ligada; `faltante` = lo que
      falta. Un gasto parcial sigue en «Gastos sin banco». */
  gasto_conciliado?: boolean | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  /** Cobro de vuelo conciliado (ABONOS): detalle + navegación al vuelo. */
  cobro?: {
    monto?: string | null;
    moneda?: string | null;
    metodo_cobro?: string | null;
    fecha_cobro?: string | null;
    vuelo_id: string | null;
    vuelo?: { folio: number | null } | null;
  } | null;
  /** Sobre de grupo conciliado (ABONOS): detalle + navegación al grupo.
      Aditivo; null cuando la liga es por cobro de vuelo o gasto. */
  cobro_grupo?: SobreConciliacion | null;
  /** POR QUÉ sigue pendiente (ADITIVOS del 15-sep-2026, siempre opcionales):
      `motivo_pendiente` = código del API ('SIN_CANDIDATOS' | 'SE_PUEDE_CRUZAR' | 'AMBIGUO' |
      'SOLO_PARCIAL' | 'GASTO_YA_CUBIERTO' | 'FUERA_DE_VENTANA' |
      'NO_ES_DE_VUELO' | 'ERROR'), `candidatos_n` = cuántos gastos/cobros
      cuadraban y `auto_match_error` = el error que tumbó SU cruce (el resto
      del lote sí se procesó). Se leen SIEMPRE por `motivoPendienteDe`
      (`lib/admin/conciliacion-auto.ts`): sin ellos, badge «Pendiente». */
  motivo_pendiente?: string | null;
  candidatos_n?: number | null;
  auto_match_error?: string | null;
  /** Conciliado por una REGLA automática (traspaso interno, comisión del
      banco…): el API deja `notas = 'Regla: <patrón>'`; este flag es el
      camino explícito si el API lo manda. */
  clasificacion_auto?: boolean | null;
}

// ===== Cruce automático y sugerencias IA (15-sep-2026) =====

/** Qué pasó con UN movimiento en el cruce automático. */
export interface AutoMatchDetalle {
  movimiento_id: string;
  /** CONCILIADO | AMBIGUO | SIN_CANDIDATO | TRASPASO | ERROR (tolerante). */
  resultado?: string | null;
  /** Con qué criterio se ligó: MONTO | TARJETA | DESCRIPCION | REGLA | … */
  criterio?: string | null;
  gasto_id?: string | null;
  cobro_id?: string | null;
  candidatos_n?: number | null;
  motivo?: string | null;
  error?: string | null;
  fecha?: string | null;
  monto?: string | number | null;
  descripcion?: string | null;
}

/**
 * Resultado de `POST /v1/conciliacion/auto-match` («Cruzar pendientes»): el
 * lote NUNCA se cae por un movimiento — lo que falla se cuenta en `errores`
 * y se explica en `detalle`.
 */
export interface AutoMatchResultado {
  revisados: number;
  conciliados: number;
  ambiguos: number;
  sin_candidato: number;
  /** Clasificados por regla (traspasos internos, comisiones…). Aditivo. */
  traspasos?: number | null;
  /** El gasto candidato ya no admitía el cargo (409 legítimo). Aditivo. */
  rechazados?: number | null;
  errores: number;
  detalle?: AutoMatchDetalle[] | null;
  /** {MONTO: 15, TARJETA: 4, …} — desglose del cruce. Aditivo. */
  por_criterio?: Record<string, number> | null;
  /** Si el API lo corre como JOB (mismo diálogo de progreso). Aditivo. */
  job_id?: string | null;
  /** true = se alcanzó el tope de la corrida y quedan pendientes sin revisar. */
  truncado?: boolean | null;
}

/** Gasto candidato para vincular un CARGO (sugerencia y «Vincular gasto»). */
export interface GastoCandidato {
  id: string;
  fecha?: string | null;
  fecha_gasto?: string | null;
  monto: string | number;
  moneda?: string | null;
  proveedor?: string | null;
  categoria?: string | null;
  lugar?: string | null;
  notas?: string | null;
  notas_primera_linea?: string | null;
  tarjeta_terminacion?: string | null;
  matricula?: string | null;
  vuelo_folio?: number | null;
  medio_pago?: string | null;
  conciliado?: boolean | null;
  tc_implicito?: number | string | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
}

/** Respuesta de `POST /v1/conciliacion/movimientos/:id/sugerir`. */
export interface SugerenciaConciliacion {
  /** false = la IA no está configurada o falló: quedan los candidatos. */
  disponible: boolean;
  gasto_id_sugerido: string | null;
  confianza: number;
  razon: string | null;
  /** Hechos citados por la IA («terminación 0577 == tarjeta del gasto»). */
  evidencias?: string[] | null;
  candidatos: GastoCandidato[];
  /** 2.ª y 3.ª opción de la IA. OJO: NO son fichas de gasto — el API manda
      `{gasto_id, confianza, razon}` y sus ids YA vienen en `candidatos`
      (los valida contra ellos). Aditivo. */
  alternativas?: Array<{ gasto_id: string; confianza: number; razon: string }> | null;
  /** Frase en español de por qué ningún candidato encaja (la redacta
      pyservices, NO es un código). Solo cuando no hay sugerido. Aditivo. */
  motivo_sin_match?: string | null;
}

/** Una propuesta del lote (`POST /v1/conciliacion/sugerir-lote`). */
export interface PropuestaConciliacion {
  movimiento_id: string;
  gasto_id_sugerido: string | null;
  confianza: number;
  razon: string | null;
  evidencias?: string[] | null;
  /** {gasto_id, confianza, razon} del API (no fichas): sus ids están en
      `candidatos`. */
  alternativas?: Array<{ gasto_id: string; confianza?: number; razon?: string }> | null;
  candidatos?: GastoCandidato[] | null;
  /** Fichas embebidas (aditivas): evitan una consulta por fila en el panel. */
  gasto?: GastoCandidato | null;
  movimiento?: {
    id?: string;
    fecha?: string | null;
    monto?: string | number | null;
    tipo?: string | null;
    descripcion?: string | null;
    referencia?: string | null;
    cuenta_bancaria_id?: string | null;
  } | null;
  motivo_sin_match?: string | null;
}

export interface SugerirLoteResponse {
  propuestas: PropuestaConciliacion[];
  /** Cuántos pendientes se revisaron y cuántos quedaron sin propuesta. */
  revisados?: number | null;
  sin_propuesta?: number | null;
  errores?: number | null;
  /** false = el asistente no está configurado (pyservices). */
  disponible?: boolean | null;
  nota?: string | null;
}

/**
 * SOBRE de cobro de GRUPO tal como lo expone conciliación (lista de
 * movimientos y candidatos). El banco concilia contra el sobre (lo que
 * depositó el cliente); las partes por avión nunca se ofrecen.
 */
export interface SobreConciliacion {
  tipo: "SOBRE_GRUPO";
  cobro_grupo_id: string;
  grupo_id: string;
  grupo_folio: number | null;
  grupo_nombre: string | null;
  /** BRUTO en la moneda del sobre. */
  monto: number;
  moneda: string;
  metodo: string;
  /** Alias de `metodo` (paridad con cobro_vuelo). */
  metodo_cobro: string;
  /** timestamptz: formatear en hora Cancún al mostrar. */
  fecha: string;
  /** Alias de `fecha`. */
  fecha_cobro: string;
  referencia: string | null;
  comision_banco_monto: number | null;
  /** Lo que depositó el banco (monto − comisión). */
  neto: number;
  /** Partes (aviones) en las que se partió el sobre. */
  aviones_n: number;
}

/** Cobro de VUELO candidato para conciliar un ABONO a mano
 *  (GET movimientos/:id/candidatos-cobro). Se manda `{cobro_id}` al PATCH. */
export interface CandidatoCobroVuelo {
  tipo: "COBRO_VUELO";
  /** = cobro_id. */
  id: string;
  cobro_id: string;
  vuelo_id: string;
  folio: number | null;
  cliente: string | null;
  /** timestamptz: formatear en hora Cancún al mostrar. */
  fecha_cobro: string;
  /** BRUTO. */
  monto: number;
  moneda: string;
  metodo_cobro: string;
  referencia: string | null;
  comision_banco_monto: number | null;
  /** Lo que depositó el banco (monto − comisión). */
  neto: number;
  /** |neto − monto del abono| (0 = cuadra exacto). */
  dif_monto: number;
}

/** SOBRE de grupo candidato. Se manda `{cobro_grupo_id}` al PATCH. */
export interface CandidatoSobreGrupo extends SobreConciliacion {
  /** = cobro_grupo_id. */
  id: string;
  cliente: string | null;
  /** |neto − monto del abono| (0 = cuadra exacto). */
  dif_monto: number;
}

export type CandidatoCobro = CandidatoCobroVuelo | CandidatoSobreGrupo;

/** Respuesta de GET /v1/conciliacion/movimientos/:id/candidatos-cobro. */
export interface CandidatosCobroResponse {
  movimiento: {
    id: string;
    fecha: string;
    monto: number;
    tipo: string;
    moneda: string | null;
    cobro_id: string | null;
    cobro_grupo_id: string | null;
  };
  /** Ordenados por dif_monto asc y luego cercanía de fecha (tope 60). */
  candidatos: CandidatoCobro[];
  /** Cuántos cuadran exacto (dif_monto = 0). */
  exactos: number;
}

export interface ConciliacionResumenCuenta {
  cuenta_bancaria_id: string;
  alias: string | null;
  banco: string | null;
  moneda: string | null;
  total: number;
  conciliados: number;
  pendientes: number;
  monto_pendiente: number;
}

export interface MovimientoListResponse {
  data: MovimientoBancario[];
  count: number;
  limit: number;
  offset: number;
}

export interface MovimientoParseado {
  fecha: string | null;
  descripcion: string | null;
  /** Positivo; en formato `paywise` es el NETO depositado. */
  monto: number;
  tipo: TipoMovimientoBancario;
  referencia: string | null;
  /** ADITIVOS (Paywise): solo el formato `paywise` los llena. */
  monto_bruto?: number | null;
  comision?: number | null;
  estatus?: string | null;
}

/**
 * Mapeo MANUAL de columnas para leer un archivo como Paywise cuando la
 * detección por encabezados no lo reconoce: nombres de columna tal como
 * vienen en el archivo (tolerante a mayúsculas/acentos). Exige fecha y
 * bruto o neto (POST /v1/conciliacion/parse `mapeo`).
 */
export interface MapeoColumnasPaywise {
  fecha: string;
  bruto?: string;
  comision?: string;
  neto?: string;
  referencia?: string;
  descripcion?: string;
  estatus?: string;
}

export interface ParsedStatement {
  movimientos: MovimientoParseado[];
  total: number;
  /** csv | excel | pdf | paywise */
  formato: string;
  notas: string;
  modelo: string | null;
  /** Encabezados del archivo tabular (para el mapeo manual). Aditivo. */
  columnas?: string[];
}

// ===== Auditoría Paywise (GET /v1/conciliacion/paywise/auditoria) =====

export type CriterioCrucePaywise = "YA_CONCILIADO" | "NETO" | "BRUTO" | "REFERENCIA";

/** ABONO importado de una cuenta PASARELA (neto depositado + bruto/comisión). */
export interface PaywiseMovimiento {
  id: string;
  /** DATE YYYY-MM-DD. */
  fecha: string;
  /** NETO depositado. */
  monto: number;
  monto_bruto?: number | null;
  comision_monto?: number | null;
  referencia?: string | null;
  descripcion?: string | null;
  moneda?: string | null;
  cobro_id?: string | null;
  cobro_grupo_id?: string | null;
}

/** Cobro PAYWISE del sistema: cobro de vuelo o sobre de grupo. */
export interface PaywiseCobro {
  tipo: "COBRO_VUELO" | "SOBRE_GRUPO";
  id: string;
  /** ISO timestamptz (formatear en hora Cancún). */
  fecha_cobro: string;
  /** BRUTO que pagó el cliente. */
  monto: number;
  moneda: string;
  metodo_cobro?: string | null;
  comision_banco_monto?: number | null;
  referencia?: string | null;
  vuelo_id?: string | null;
  folio?: number | null;
  grupo_id?: string | null;
  grupo_folio?: number | null;
  cliente?: string | null;
}

export interface PaywiseCruce {
  movimiento: PaywiseMovimiento;
  cobro: PaywiseCobro;
  criterio: CriterioCrucePaywise;
  dif_dias: number;
  /** Neto que el sistema esperaba (bruto − comisión registrada). */
  neto_sistema: number;
  /** Comisión según el archivo (null si no la trae). */
  comision_paywise: number | null;
  comision_sistema: number;
  dif_comision: number | null;
  comision_distinta: boolean;
  dif_bruto: number | null;
  dif_neto: number;
}

export interface PaywiseAmbiguo {
  movimiento: PaywiseMovimiento;
  criterio: Exclude<CriterioCrucePaywise, "YA_CONCILIADO">;
  candidatos: PaywiseCobro[];
}

export interface PaywiseAuditoriaResumen {
  movimientos_paywise: number;
  cobros_sistema: number;
  coinciden: number;
  ya_conciliados: number;
  conciliables: number;
  comision_distinta: number;
  referencia_monto_distinto: number;
  solo_paywise: number;
  solo_sistema: number;
  ambiguos: number;
  movimientos_conciliados_fuera: number;
  cobros_conciliados_fuera: number;
  neto_paywise: number;
  neto_solo_paywise: number;
  bruto_solo_sistema: number;
  dif_comision_total: number;
  conciliados_ahora: number;
  errores: number;
}

export interface PaywiseAuditoria {
  periodo: { desde: string; hasta: string };
  dias: number;
  cuentas: { id: string; alias: string; moneda: string }[];
  resumen: PaywiseAuditoriaResumen;
  coinciden: PaywiseCruce[];
  comision_distinta: PaywiseCruce[];
  referencia_monto_distinto: PaywiseCruce[];
  solo_paywise: PaywiseMovimiento[];
  solo_sistema: PaywiseCobro[];
  ambiguos: PaywiseAmbiguo[];
  errores: { movimiento_id: string; cobro_id: string; tipo: string; error: string }[];
}

/** Cobro bancario sin abono importado (GET /v1/conciliacion/cobros-sin-banco). */
export interface CobroSinBanco extends PaywiseCobro {
  metodo_label: string;
  /** monto − comisión registrada. */
  neto: number;
}

export interface CobrosSinBancoResponse {
  data: CobroSinBanco[];
  total: number;
  desde: string;
  hasta: string;
  por_moneda: { moneda: string; monto: number }[];
}

/** Estado de cuenta importado: el archivo original queda archivado para
 *  consultarlo/descargarlo después (GET /v1/conciliacion/estados-cuenta). */
export interface EstadoCuentaArchivo {
  id: string;
  cuenta_bancaria_id: string;
  filename: string;
  formato: string | null;
  movimientos_importados: number | null;
  created_at: string;
  cuenta?: { banco: string | null; alias: string | null; moneda: string | null } | null;
}
