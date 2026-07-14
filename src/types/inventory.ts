export type TipoMovimiento = "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";

export interface InventarioItem {
  id: string;
  nombre: string;
  numero_parte: string | null;
  codigo: string | null;
  categoria: string;
  stock_minimo: number | null;
  /** Presentación del stock: pieza, caja, bote, galón, litro, bolsa… */
  unidad?: string | null;
  /** Foto del producto (URL pública del bucket inventario-fotos). */
  foto_url?: string | null;
  foto_storage_path?: string | null;
  ubicacion: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** Ítem enriquecido con stock y valuación calculados por el API. */
export interface InventarioItemWithStock extends InventarioItem {
  stock: number;
  valor_usd: number;
  costo_fifo_actual: number;
  /** Valorizado en pesos (moneda operativa del cliente); el USD es para el reparto. */
  valor_mxn: number;
  costo_fifo_mxn_actual: number;
  bajo_stock: boolean;
}

export interface InventarioMovimiento {
  id: string;
  item_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario_usd: number;
  /** Moneda en la que se CAPTURÓ el costo (la contabilidad interna es USD). */
  moneda?: "MXN" | "USD";
  costo_unitario_mxn?: number | null;
  tc_usd_mxn?: number | null;
  aeronave_id: string | null;
  proveedor_id: string | null;
  fecha_movimiento: string;
  fecha_orden: string | null;
  fecha_cargo_banco: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  aeronave?: { matricula: string } | null;
  proveedor?: { nombre: string } | null;
  item?: { nombre: string; numero_parte: string | null; categoria: string } | null;
}

export interface InventarioListResponse {
  data: InventarioItemWithStock[];
  count: number;
  limit: number;
  offset: number;
  valor_total_usd: number;
  valor_total_mxn: number;
}

export interface InventarioItemDetail extends InventarioItemWithStock {
  movimientos: InventarioMovimiento[];
}

export interface MovimientoListResponse {
  data: InventarioMovimiento[];
  count: number;
  limit: number;
  offset: number;
}

export interface CompraLineaExtraida {
  nombre: string;
  numero_parte: string | null;
  cantidad: number;
  precio_unitario_usd: number | null;
  total_usd: number | null;
}

export interface CompraExtraida {
  proveedor: string | null;
  fecha: string | null;
  moneda: string;
  lineas: CompraLineaExtraida[];
  subtotal_usd: number | null;
  shipping_usd: number | null;
  impuestos_usd: number | null;
  total_usd: number | null;
  confianza: number;
  notas: string;
  modelo: string;
}
