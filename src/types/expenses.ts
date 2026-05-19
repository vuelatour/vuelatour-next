import type { ListResponse } from "./aircraft";

export type CategoriaGasto =
  | "GAS"
  | "ATERRIZAJE"
  | "TUAS"
  | "FBO"
  | "COMIDA"
  | "HOTEL"
  | "TAXI"
  | "REFACCION"
  | "PERMISO"
  | "FIJO"
  | "OTRO";

export type MonedaGasto = "MXN" | "USD";

export type MedioPago =
  | "EFECTIVO"
  | "TARJETA_CORP"
  | "PERSONAL_PABLO"
  | "PERSONAL_ALE"
  | "TRANSFERENCIA";

export type EstatusComprobante = "FACTURA" | "VALE" | "SIN_COMPROBANTE";

export interface Expense {
  id: string;
  vuelo_id: string | null;
  aeronave_id: string | null;
  usuario_captura_id: string;
  categoria: CategoriaGasto;
  monto: string;
  moneda: MonedaGasto;
  tc_gasto: string | null;
  fecha_gasto: string;
  proveedor_id: string | null;
  medio_pago: MedioPago;
  tarjeta_terminacion: string | null;
  estatus_comprobante: EstatusComprobante;
  foto_url: string | null;
  valor_ia_extraido: Record<string, unknown> | null;
  conciliado: boolean;
  duplicado_sospechado: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseListResponse = ListResponse<Expense>;
