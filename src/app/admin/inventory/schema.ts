import { z } from "zod";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().min(0, "No puede ser negativo").optional(),
);

const requiredPositive = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Número inválido" }).positive("Debe ser mayor a 0"),
);

const optionalPositive = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Número inválido" }).positive("Debe ser mayor a 0").optional(),
);

/**
 * Código de barras tal cual lo entrega el escáner: sin espacios (la
 * etiqueta impresa los trae — "0 21400 06215 3" → "021400062153"). La BD
 * normaliza igual; aquí se hace antes para que el 409 por duplicado sea
 * legible y la comparación en el form no falle por un espacio.
 */
export function normalizarCodigo(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, "") : "";
}

const codigoBarras = z.preprocess(
  (v) => (typeof v === "string" ? normalizarCodigo(v) : v),
  z.string().max(60).optional().or(z.literal("")),
);

/** Empaque (caja) nuevo: se manda en `empaques[]` al crear el ítem o al endpoint de empaques. */
export const EmpaqueFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(60),
  factor: requiredPositive,
  codigo: codigoBarras,
});

export const EmpaqueUpdateSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(60).optional(),
  factor: optionalPositive,
  // null explícito = quitar el código del empaque.
  codigo: z.preprocess(
    (v) => (typeof v === "string" ? normalizarCodigo(v) : v),
    z.string().max(60).nullable().optional().or(z.literal("")),
  ),
  activo: z.boolean().optional(),
});

export const ItemFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  marca: z.string().max(80).optional().or(z.literal("")),
  numero_parte: z.string().max(50).optional().or(z.literal("")),
  codigo: codigoBarras,
  categoria: z.string().min(1, "Requerido").max(50),
  stock_minimo: optionalNumber,
  ubicacion: z.string().max(50).optional().or(z.literal("")),
  // Un número aquí NO es una unidad de medida: capturarlo así dejó un ítem
  // en stock 0 (6 ago 2026). La cantidad va en la entrada inicial/cardex.
  unidad: z
    .string()
    .max(30)
    .refine((v) => v === "" || !/^[\d.,]+$/.test(v.trim()), {
      message:
        "Escribe en qué se cuenta (pieza, caja, litro). La cantidad va en la entrada inicial.",
    })
    .optional()
    .or(z.literal("")),
  descripcion: z.string().max(2000).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
  // Foto del producto: null explícito = quitarla (stripEmpty deja pasar null).
  foto_url: z.string().max(1000).nullable().optional().or(z.literal("")),
  foto_storage_path: z.string().max(500).nullable().optional().or(z.literal("")),
  // Fotos extra [{url, path}]: [] al editar = quitarlas todas (el API borra
  // los huérfanos del bucket como con foto_storage_path).
  fotos_adicionales: z
    .array(z.object({ url: z.string().max(1000), path: z.string().max(500) }))
    .max(12)
    .optional(),
  // Solo al CREAR: los empaques nacen junto con el ítem. Al editar se
  // administran con los endpoints de empaques (ver actions).
  empaques: z.array(EmpaqueFormSchema).max(10).optional(),
});

export const TipoMovimientoEnum = z.enum(["ENTRADA", "SALIDA", "DEVOLUCION", "AJUSTE"]);

export const MovimientoFormSchema = z
  .object({
    tipo: TipoMovimientoEnum,
    /** SIEMPRE en unidades (fuente única del cardex/FIFO). */
    cantidad: requiredPositive,
    // Captura por empaque (caja): cantidad = cantidad_empaques × factor.
    empaque_id: z.string().uuid().optional().or(z.literal("")),
    cantidad_empaques: optionalPositive,
    // Captura en MXN (default operativo) o USD; con MXN el TC es obligatorio
    // (la contabilidad interna del inventario sigue en USD).
    moneda: z.enum(["MXN", "USD"]).optional(),
    costo_unitario_usd: optionalNumber,
    costo_unitario_mxn: optionalNumber,
    tc_usd_mxn: optionalNumber,
    aeronave_id: z.string().uuid().optional().or(z.literal("")),
    para_flota: z.boolean().optional(),
    proveedor_id: z.string().uuid().optional().or(z.literal("")),
    fecha_movimiento: z.string().optional().or(z.literal("")),
    fecha_orden: z.string().optional().or(z.literal("")),
    fecha_cargo_banco: z.string().optional().or(z.literal("")),
    referencia: z.string().max(100).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (d) =>
      d.tipo !== "SALIDA" ||
      d.para_flota === true ||
      (!!d.aeronave_id && d.aeronave_id !== ""),
    {
      message: "Registra el avión o marca 'Para todas las matrículas'",
      path: ["aeronave_id"],
    },
  )
  .refine(
    (d) => d.tipo === "SALIDA" || d.moneda !== "MXN" || d.costo_unitario_mxn != null,
    { message: "El costo unitario es requerido", path: ["costo_unitario_mxn"] },
  )
  .refine(
    (d) =>
      d.tipo === "SALIDA" || d.moneda === "MXN" || d.costo_unitario_usd != null,
    { message: "El costo unitario es requerido", path: ["costo_unitario_usd"] },
  )
  .refine(
    (d) =>
      d.tipo === "SALIDA" ||
      d.moneda !== "MXN" ||
      (d.tc_usd_mxn != null && d.tc_usd_mxn > 0),
    {
      message: "Captura el tipo de cambio de la compra",
      path: ["tc_usd_mxn"],
    },
  );

/**
 * Fila de empaque en el formulario del ítem (todo texto). `empaque_id` si ya
 * existe — no se llama `id` porque useFieldArray pisa esa clave con su key.
 */
export type EmpaqueFormRow = {
  empaque_id?: string;
  nombre: string;
  factor: string;
  codigo: string;
  activo: boolean;
};

export type ItemFormValues = {
  nombre: string;
  marca: string;
  numero_parte: string;
  codigo: string;
  categoria: string;
  stock_minimo: string;
  ubicacion: string;
  unidad: string;
  descripcion: string;
  notas: string;
  empaques: EmpaqueFormRow[];
  // Solo al CREAR: entrada inicial opcional (cantidad + costo de compra) para
  // que el ítem no quede en stock 0 sin precio. Genera una ENTRADA de cardex.
  cantidad_inicial: string;
  /** Costo unitario inicial EN LA MONEDA elegida (moneda_inicial). */
  costo_inicial_usd: string;
  moneda_inicial: "MXN" | "USD";
  tc_inicial: string;
};

export type MovimientoFormValues = {
  tipo: "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";
  cantidad: string;
  /** "" = por unidades; id del empaque = por cajas. */
  empaque_id: string;
  cantidad_empaques: string;
  para_flota: boolean;
  moneda: "MXN" | "USD";
  costo_unitario_usd: string;
  costo_unitario_mxn: string;
  tc_usd_mxn: string;
  aeronave_id: string;
  proveedor_id: string;
  fecha_movimiento: string;
  referencia: string;
  notas: string;
};
