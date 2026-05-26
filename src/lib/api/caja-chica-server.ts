import { apiServer } from "./server";
import type { CajaFondoDetail, CajaFondoListResponse } from "@/types/caja-chica";

export interface ListFondosQuery {
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listFondos(query: ListFondosQuery = {}) {
  return apiServer<CajaFondoListResponse>("/v1/caja-chica/fondos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getFondo(id: string) {
  return apiServer<CajaFondoDetail>(`/v1/caja-chica/fondos/${id}`, { cache: "no-store" });
}
