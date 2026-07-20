import { apiServer } from "./server";
import type { GastoListResponse } from "@/types/expenses";

/** Cargas de combustible (gastos categoría GAS). */
export function listFuelLoads() {
  return apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: { categoria: "GAS", limit: 200 },
    cache: "no-store",
  });
}

export interface ListGastosQuery {
  vuelo_id?: string;
  aeronave_id?: string;
  usuario_captura_id?: string;
  categoria?: string;
  estatus_comprobante?: string;
  medio_pago?: string;
  pendientes?: boolean;
  duplicados?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

/** Bandeja de gastos para verificación en oficina. */
export function listGastos(query: ListGastosQuery = {}) {
  return apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/** Firma las fotos de recibos (bucket privado). */
export function signFuelPhotos(paths: string[]) {
  if (paths.length === 0) return Promise.resolve<Record<string, string>>({});
  return apiServer<Record<string, string>>("/v1/expenses/photo-urls", {
    method: "POST",
    body: { paths },
    cache: "no-store",
  });
}
