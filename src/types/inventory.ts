export type TipoMovimiento = "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";

/** Foto extra del producto en el bucket inventario-fotos. */
export interface InventarioFoto {
  url: string;
  path: string;
}

/**
 * Presentación/empaque de un ítem (caja de 6, tarima…). `factor` = unidades
 * del ítem que contiene; `codigo` = código de barras del EMPAQUE (distinto al
 * de la unidad). Un movimiento por empaque rebaja factor × cantidad_empaques
 * unidades — la cantidad en unidades sigue siendo la fuente única del cardex.
 */
export interface InventarioEmpaque {
  id: string;
  nombre: string;
  factor: number;
  codigo: string | null;
  activo: boolean;
}

export interface InventarioItem {
  id: string;
  nombre: string;
  numero_parte: string | null;
  codigo: string | null;
  categoria: string;
  stock_minimo: number | null;
  /** Presentación del stock: pieza, caja, bote, galón, litro, bolsa… */
  unidad?: string | null;
  /**
   * Precio de VENTA unitario al avión (29-ago-2026): la SALIDA se carga a
   * este precio como gasto BODEGA; el costo FIFO queda para el inventario.
   * Sin precio, la salida se carga a costo FIFO. Opcional por skew de deploy.
   */
  precio_venta?: number | null;
  precio_venta_moneda?: "MXN" | "USD" | null;
  /** Foto del producto (URL pública del bucket inventario-fotos). */
  foto_url?: string | null;
  foto_storage_path?: string | null;
  /** Fotos adicionales (la principal sigue en foto_url). Opcional por skew de deploy. */
  fotos_adicionales?: InventarioFoto[] | null;
  /** Marca / fabricante (AeroShell). */
  marca?: string | null;
  /** Descripción de ficha (contenido, presentación, especificación). */
  descripcion?: string | null;
  /** Empaques (cajas) del ítem. Opcional por skew de deploy. */
  empaques?: InventarioEmpaque[] | null;
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
  /** SALIDA con venta: precio unitario que pagó el avión (null = a costo FIFO). */
  venta_unitaria?: number | null;
  venta_moneda?: "MXN" | "USD" | null;
  /** Venta total MXN − costo FIFO MXN (la manda el API en el detalle del ítem). */
  ganancia_mxn?: number | null;
  aeronave_id: string | null;
  proveedor_id: string | null;
  fecha_movimiento: string;
  fecha_orden: string | null;
  fecha_cargo_banco: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  /** Capturado por empaque: cantidad (unidades) = cantidad_empaques × factor. */
  empaque_id?: string | null;
  cantidad_empaques?: number | null;
  empaque?: { nombre: string; factor: number } | null;
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

/** GET /v1/inventory/codigo/:codigo — un código identifica un ítem O un empaque. */
export interface CodigoLookup {
  tipo: "ITEM" | "EMPAQUE";
  item: InventarioItemDetail;
  empaque: { id: string; nombre: string; factor: number; codigo: string | null } | null;
}

export type ImportarItemEstado = "OK" | "ERROR" | "DUPLICADO";

/** Fila de la alta masiva (preview y confirmación comparten la forma). */
export interface ImportarItemsFila {
  fila: number;
  estado: ImportarItemEstado;
  nombre: string | null;
  codigo: string | null;
  mensajes: string[];
  crear?: {
    item?: {
      nombre?: string;
      marca?: string | null;
      categoria?: string;
      numero_parte?: string | null;
      codigo?: string | null;
      unidad?: string | null;
      ubicacion?: string | null;
      stock_minimo?: number | null;
    } | null;
    empaque?: { nombre: string; factor: number; codigo?: string | null } | null;
    entrada_inicial?: {
      cantidad?: number;
      moneda?: "MXN" | "USD";
      costo_unitario_usd?: number | null;
      costo_unitario_mxn?: number | null;
      tc_usd_mxn?: number | null;
    } | null;
  } | null;
}

export interface ImportarItemsResultado {
  total: number;
  filas: ImportarItemsFila[];
  /** Solo con confirmar=true. */
  creados?: number;
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
