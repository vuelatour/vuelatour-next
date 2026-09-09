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
