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
  origen: string;
  notas: string | null;
  created_at: string;
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
  monto: number;
  tipo: TipoMovimientoBancario;
  referencia: string | null;
}

export interface ParsedStatement {
  movimientos: MovimientoParseado[];
  total: number;
  formato: string;
  notas: string;
  modelo: string | null;
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
