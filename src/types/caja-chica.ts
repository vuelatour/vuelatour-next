export type TipoMovimientoCaja = "REPOSICION" | "REINTEGRO" | "AJUSTE";
export type MonedaCaja = "MXN" | "USD";

export interface CajaUsuario {
  nombre: string;
  email: string;
  rol: string;
}

export interface CajaFondo {
  id: string;
  usuario_id: string;
  moneda: MonedaCaja;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  usuario?: CajaUsuario | null;
  saldo: number;
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
