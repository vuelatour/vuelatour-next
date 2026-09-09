import type { ListResponse } from "./aircraft";

export type Moneda = "MXN" | "USD";
export type RazonSocialEmisora = "AEROCHARTER" | "AERODINAMICA" | "OTRA";
/**
 * Tipo de cuenta (9-sep-2026): BANCO = estado de cuenta clásico; PASARELA =
 * Paywise (cada abono trae bruto/comisión/neto y liquida con días de
 * retraso: la conciliación coteja bruto/neto/referencia a ±5 días).
 */
export type TipoCuentaBancaria = "BANCO" | "PASARELA";

export interface BankAccount {
  id: string;
  alias: string;
  banco: string;
  numero_cuenta: string | null;
  clabe: string | null;
  moneda: Moneda;
  razon_social: RazonSocialEmisora;
  /** Opcional-defensivo: un API previo no lo manda (= BANCO). */
  tipo?: TipoCuentaBancaria | null;
  notas: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export type BankAccountListResponse = ListResponse<BankAccount>;
