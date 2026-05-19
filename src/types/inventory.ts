import type { ListResponse } from "./aircraft";

export type TipoMovimientoInventario = "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";

export interface InventoryItem {
  id: string;
  nombre: string;
  numero_parte: string | null;
  categoria: string;
  stock_minimo: string | null;
  ubicacion: string;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  stock_actual: number;
  valor_usd: number;
  bajo_stock: boolean;
}

export type InventoryItemListResponse = ListResponse<InventoryItem>;

export interface InventoryMovement {
  id: string;
  item_id: string;
  tipo: TipoMovimientoInventario;
  cantidad: string;
  costo_unitario_usd: string;
  aeronave_id: string | null;
  proveedor_id: string | null;
  fecha_movimiento: string;
  fecha_orden: string | null;
  fecha_cargo_banco: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  updated_at: string;
}

export type InventoryMovementListResponse = ListResponse<InventoryMovement>;

export interface CardexEntry extends InventoryMovement {
  saldo: number;
}
