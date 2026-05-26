import type { ListResponse } from "./aircraft";

export type TipoFondo = "FIJO" | "REINTEGRO";
export type MedioPagoFondo = "EFECTIVO" | "PERSONAL_PABLO" | "PERSONAL_ALE";
export type TipoMovimientoFondo = "REPOSICION" | "REINTEGRO" | "AJUSTE";
export type EstadoMovimientoFondo = "SOLICITADO" | "AUTORIZADO" | "RECHAZADO";

export interface CashFund {
  id: string;
  usuario_id: string;
  tipo: TipoFondo;
  medio_pago_asociado: MedioPagoFondo;
  monto_asignado: string;
  moneda: string;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  total_gastado: number;
  total_repuesto: number;
  pendiente_autorizar: number;
  saldo: number;
}

export type CashFundListResponse = ListResponse<CashFund>;

export interface FundMovement {
  id: string;
  fondo_id: string;
  tipo: TipoMovimientoFondo;
  monto: string;
  fecha: string;
  estado: EstadoMovimientoFondo;
  solicitado_por: string;
  autorizado_por: string | null;
  autorizado_at: string | null;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type FundMovementListResponse = ListResponse<FundMovement>;
