import type { ListResponse } from "./aircraft";

export type Moneda = "MXN" | "USD";
export type RazonSocialEmisora = "AEROCHARTER" | "AERODINAMICA" | "OTRA";

export interface BankAccount {
  id: string;
  alias: string;
  banco: string;
  numero_cuenta: string | null;
  clabe: string | null;
  moneda: Moneda;
  razon_social: RazonSocialEmisora;
  notas: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export type BankAccountListResponse = ListResponse<BankAccount>;
