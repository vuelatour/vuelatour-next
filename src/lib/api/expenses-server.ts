import { apiServer } from "./server";
import type { GastoListResponse } from "@/types/expenses";

export interface ListFuelLoadsQuery {
  /** Rango sobre fecha_gasto (DATE), normalmente el mes elegido. */
  desde?: string;
  hasta?: string;
  aeronave_id?: string;
}

/**
 * Cargas de combustible (gastos categoría GAS) del periodo, SIN cap:
 * pagina con offset hasta cubrir `count` (patrón anti-cap-200) para que el
 * resumen mensual por avión nunca sume un mes incompleto.
 */
export async function listFuelLoads(query: ListFuelLoadsQuery = {}) {
  const limit = 200;
  const base = { categoria: "GAS", limit, ...query };
  const first = await apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: { ...base, offset: 0 },
    cache: "no-store",
  });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await apiServer<GastoListResponse>("/v1/expenses", {
      searchParams: { ...base, offset: data.length },
      cache: "no-store",
    });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

export interface ListGastosQuery {
  vuelo_id?: string;
  aeronave_id?: string;
  usuario_captura_id?: string;
  categoria?: string;
  estatus_comprobante?: string;
  /** PENDIENTE | SOLICITADA | FACTURADA | NO_FACTURADA (pend. o sol.). */
  estatus_facturacion?: string;
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
