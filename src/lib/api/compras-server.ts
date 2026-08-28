import { apiServer } from "./server";
import type {
  CompraDetalle,
  CompraEstado,
  CompraListResponse,
} from "@/types/compras";

export interface ListComprasQuery {
  estado?: CompraEstado;
  limit?: number;
  offset?: number;
}

/** Compras de refacciones (lista). */
export function listCompras(query: ListComprasQuery = {}) {
  return apiServer<CompraListResponse>("/v1/compras", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/** Detalle de una compra: líneas con costo final, pagos ligados y resumen. */
export function getCompra(id: string) {
  return apiServer<CompraDetalle>(`/v1/compras/${id}`, { cache: "no-store" });
}
