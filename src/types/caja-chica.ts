export type TipoMovimientoCaja = "REPOSICION" | "REINTEGRO" | "AJUSTE";
export type MonedaCaja = "MXN" | "USD";

export interface CajaUsuario {
  nombre: string;
  email: string;
  rol: string;
}

export interface CajaFondo {
  /** Caja al revés: `saldo` = lo POR REPONER (sube al gastar, 0 al reponer). */
  es_acumulada?: boolean;
  id: string;
  usuario_id: string;
  moneda: MonedaCaja;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  usuario?: CajaUsuario | null;
  saldo: number;
  /** Monto nominal del fondo (a cuánto se repone). Null = sin fijar. */
  monto_fondo?: number | string | null;
  /** Última REPOSICIÓN registrada; null si nunca ha habido. */
  ultima_reposicion?: { fecha: string; monto: number } | null;
  /** Caja MADRE que fondea a esta (espejos automáticos). Null = sin vínculo. */
  fondo_origen_id?: string | null;
}

export interface CajaMovimiento {
  id: string;
  fondo_id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  moneda: MonedaCaja;
  fecha: string;
  autorizado_por: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  autorizado?: { nombre: string } | null;
  registrado?: { nombre: string } | null;
  /** Espejo de un fondeo automático: sigue a su origen, no se edita directo. */
  espejo_de_id?: string | null;
}

export interface HistorialEntry {
  id: string;
  fecha: string;
  origen: "caja" | "gasto";
  tipo: string;
  monto: number;
  descripcion: string | null;
  saldo: number;
  /** Vuelo del gasto en efectivo (null en movimientos de caja). */
  vuelo_id?: string | null;
  vuelo_folio?: number | null;
}

export interface CajaFondoListResponse {
  data: CajaFondo[];
  count: number;
  limit: number;
  offset: number;
}

export interface CajaFondoDetail extends CajaFondo {
  movimientos: CajaMovimiento[];
  historial: HistorialEntry[];
}
