import { apiServer } from "./server";
import type {
  InventarioItemDetail,
  InventarioListResponse,
  MovimientoListResponse,
} from "@/types/inventory";

export interface ListInventarioQuery {
  q?: string;
  categoria?: string;
  activo?: boolean;
  bajo_stock?: boolean;
  limit?: number;
  offset?: number;
}

export function listInventario(query: ListInventarioQuery = {}) {
  return apiServer<InventarioListResponse>("/v1/inventory/items", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getInventarioItem(id: string) {
  return apiServer<InventarioItemDetail>(`/v1/inventory/items/${id}`, {
    cache: "no-store",
  });
}

export interface ListMovimientosQuery {
  item_id?: string;
  aeronave_id?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listMovimientos(query: ListMovimientosQuery = {}) {
  return apiServer<MovimientoListResponse>("/v1/inventory/movimientos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
