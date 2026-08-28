/**
 * COMPRAS de refacciones (28-ago-2026): la mercancía se compra (factura 1,
 * p. ej. Aircraft Spruce en USD) y después se pagan impuestos/aduana y envío
 * (factura 2, p. ej. UPS en MXN). La compra une esos pagos —cada uno sigue
 * siendo un gasto con su factura y su cruce bancario— y reparte los cargos
 * al costo de cada refacción (lo calcula el API: fuente única).
 */

export type CompraEstado = "ABIERTA" | "RECIBIDA";
export type CompraMoneda = "USD" | "MXN";
/** Qué pagó cada gasto ligado a la compra. */
export type CompraRol = "MERCANCIA" | "ENVIO" | "IMPUESTOS" | "OTRO";

/** numeric de Postgres: el API puede devolverlo como string. */
export type Numeric = number | string;

export function toNum(v: Numeric | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export const COMPRA_ROL_LABELS: Record<CompraRol, string> = {
  MERCANCIA: "Mercancía",
  ENVIO: "Envío",
  IMPUESTOS: "Impuestos",
  OTRO: "Otro",
};

export const COMPRA_ROL_OPTIONS: Array<{ value: CompraRol; label: string }> = [
  { value: "MERCANCIA", label: "Mercancía (factura de las refacciones)" },
  { value: "ENVIO", label: "Envío (paquetería)" },
  { value: "IMPUESTOS", label: "Impuestos / aduana" },
  { value: "OTRO", label: "Otro cargo" },
];

export const COMPRA_ESTADO_LABELS: Record<CompraEstado, string> = {
  ABIERTA: "Abierta",
  RECIBIDA: "Recibida",
};

/**
 * Categorías de gasto que pueden ser PAGO de una compra de refacciones: la
 * factura de mercancía (REFACCION) o su envío/impuestos/otro cargo (OTRO,
 * OPERACIONES p. ej. aduana). Fuente ÚNICA para la casilla "Unir en compra",
 * el menú ⋯ del gasto y los candidatos de "Agregar pago": lo demás (GAS,
 * VISITA, PERSONAL_DUENO, viáticos…) jamás entra a una compra.
 */
export const CATEGORIAS_COMPRA = new Set(["REFACCION", "OTRO", "OPERACIONES"]);

export function esCategoriaCompra(categoria: string | null | undefined): boolean {
  return !!categoria && CATEGORIAS_COMPRA.has(categoria);
}

/** Resumen ligado a un gasto (viaja en /v1/expenses como `compra`). */
export interface CompraRef {
  id: string;
  folio: number;
  referencia: string | null;
  estado: CompraEstado;
  proveedor: { nombre: string } | null;
  /**
   * Total REAL de pagos de la compra (no solo los que caben en el filtro o
   * el corte de la bandeja). Opcional: skew de deploy del API.
   */
  n_pagos?: number;
}

/** Fila de GET /v1/compras. */
export interface CompraListItem {
  id: string;
  folio: number;
  proveedor: { id: string; nombre: string } | null;
  fecha: string;
  referencia: string | null;
  moneda: CompraMoneda;
  estado: CompraEstado;
  n_lineas: number;
  n_pagos: number;
  /** Suma de líneas (moneda de la compra). */
  total_mercancia: Numeric;
  /** Mercancía + cargos (moneda de la compra) = costo puesto en bodega. */
  total: Numeric;
  total_mxn: Numeric | null;
  total_usd: Numeric | null;
}

export interface CompraListResponse {
  data: CompraListItem[];
  count: number;
}

export interface CompraCargoFactura {
  concepto: string;
  monto: Numeric;
}

export interface CompraLinea {
  id: string;
  orden: number;
  item: { id: string; nombre: string; numero_parte: string | null } | null;
  nombre: string;
  numero_parte: string | null;
  categoria: string | null;
  cantidad: Numeric;
  /** Costo unitario de FACTURA (moneda de la compra). */
  costo_unitario: Numeric;
  /** Costo unitario puesto en bodega (factura + cargos prorrateados). */
  costo_unitario_final: Numeric;
  costo_unitario_final_usd: Numeric | null;
  costo_unitario_final_mxn: Numeric | null;
  total_linea_final: Numeric;
  /** ENTRADA del cardex generada al recibir (null hasta recibir). */
  inventario_movimiento_id: string | null;
}

/** Gasto ligado como pago de la compra (subconjunto del gasto). */
export interface CompraPago {
  id: string;
  fecha_gasto: string | null;
  categoria: string;
  monto: Numeric;
  moneda: "MXN" | "USD";
  tc_gasto: Numeric | null;
  medio_pago: string;
  proveedor: { nombre: string } | null;
  foto_url: string | null;
  notas: string | null;
  compra_rol: CompraRol;
  conciliado: boolean;
}

export interface CompraResumen {
  total_mercancia: Numeric;
  cargos_factura: Numeric;
  cargos_pagos: Numeric;
  total: Numeric;
  /** total / total_mercancia: multiplica el costo de factura de cada línea. */
  factor: Numeric;
  moneda: CompraMoneda;
  tc_usd_mxn: Numeric | null;
  total_usd: Numeric | null;
  total_mxn: Numeric | null;
  avisos: string[];
}

/** GET /v1/compras/:id. */
export interface CompraDetalle {
  id: string;
  folio: number;
  proveedor: { id: string; nombre: string } | null;
  fecha: string;
  referencia: string | null;
  moneda: CompraMoneda;
  tc_usd_mxn: Numeric | null;
  estado: CompraEstado;
  cargos_factura: CompraCargoFactura[];
  recibida_at: string | null;
  notas: string | null;
  lineas: CompraLinea[];
  pagos: CompraPago[];
  resumen: CompraResumen;
}

/** Línea tal como viaja en PATCH /v1/compras/:id (solo ABIERTA). */
export interface CompraLineaInput {
  id?: string;
  item_id?: string;
  nombre: string;
  numero_parte?: string;
  categoria?: string;
  cantidad: number;
  costo_unitario: number;
}

export interface CompraUpdateInput {
  proveedor_id?: string | null;
  fecha?: string;
  referencia?: string | null;
  moneda?: CompraMoneda;
  tc_usd_mxn?: number | null;
  notas?: string | null;
  cargos_factura?: Array<{ concepto: string; monto: number }>;
  lineas?: CompraLineaInput[];
}

export interface CompraCreateInput {
  gasto_mercancia_id?: string;
  proveedor_id?: string;
  fecha?: string;
  referencia?: string;
  moneda?: CompraMoneda;
  tc_usd_mxn?: number;
  notas?: string;
  lineas?: CompraLineaInput[];
}

/**
 * Rol sugerido para un gasto que se liga a una compra (la oficina lo
 * confirma): refacciones = mercancía; paquetería = envío; aduana/impuestos =
 * impuestos; lo demás = otro. Misma regla en el diálogo del gasto y en el
 * de la compra.
 */
export function sugerirRolCompra(categoria: string | null | undefined, texto: string | null | undefined): CompraRol {
  const t = (texto ?? "").toLowerCase();
  if (/(ups|dhl|fedex|estafeta|paqueter|env[ií]o|shipping|flete)/.test(t)) return "ENVIO";
  if (/(aduana|impuesto|arancel|duty|tax|iva|pedimento|customs)/.test(t)) return "IMPUESTOS";
  if (categoria === "REFACCION") return "MERCANCIA";
  return "OTRO";
}

/** Monto en la moneda indicada, formato es-MX ("USD 1,234.00" / "$1,234.00"). */
export function fmtMontoMoneda(v: Numeric | null | undefined, moneda: string): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = toNum(v);
  return n.toLocaleString("es-MX", { style: "currency", currency: moneda });
}
