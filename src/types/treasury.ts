import type { ListResponse } from "./aircraft";

export type TipoMovimientoBancario = "CARGO" | "ABONO";
export type OrigenMovimientoBancario = "MANUAL" | "IMPORTADO";

export interface BankMovement {
  id: string;
  cuenta_bancaria_id: string;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: string;
  descripcion: string | null;
  referencia: string | null;
  saldo_posterior: string | null;
  conciliado: boolean;
  gasto_id: string | null;
  origen: OrigenMovimientoBancario;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type BankMovementListResponse = ListResponse<BankMovement>;

export interface TreasuryAccountSummary {
  id: string;
  alias: string;
  banco: string;
  moneda: string;
  saldo: number;
  saldo_es_estimado: boolean;
  total_abonos: number;
  total_cargos: number;
  movimientos_count: number;
  pendientes_conciliar: number;
}

export interface CardSpend {
  terminacion: string;
  titular: string | null;
  total: number;
  count: number;
}

export interface TreasuryDashboard {
  cuentas: TreasuryAccountSummary[];
  gastos_por_tarjeta: CardSpend[];
  periodo_tarjetas: { desde: string; hasta: string };
}
