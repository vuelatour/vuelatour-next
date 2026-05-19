import { apiServer } from "./server";
import type {
  CardexEntry,
  InventoryItem,
  InventoryItemListResponse,
  InventoryMovementListResponse,
} from "@/types/inventory";

export interface ListInventoryItemsQuery {
  q?: string;
  categoria?: string;
  activo?: boolean;
  bajo_stock?: boolean;
  limit?: number;
  offset?: number;
}

export function listInventoryItems(query: ListInventoryItemsQuery = {}) {
  return apiServer<InventoryItemListResponse>("/v1/inventory-items", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getInventoryItem(id: string) {
  return apiServer<InventoryItem>(`/v1/inventory-items/${id}`, { cache: "no-store" });
}

export function getCardex(id: string) {
  return apiServer<CardexEntry[]>(`/v1/inventory-items/${id}/cardex`, {
    cache: "no-store",
  });
}

export interface ListInventoryMovementsQuery {
  item_id?: string;
  tipo?: string;
  aeronave_id?: string;
  proveedor_id?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listInventoryMovements(query: ListInventoryMovementsQuery = {}) {
  return apiServer<InventoryMovementListResponse>("/v1/inventory-movements", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
