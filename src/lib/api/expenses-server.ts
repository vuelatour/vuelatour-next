import { apiServer } from "./server";
import type { GastoListResponse } from "@/types/expenses";

/** Cargas de combustible (gastos categoría GAS). */
export function listFuelLoads() {
  return apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: { categoria: "GAS", limit: 200 },
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
