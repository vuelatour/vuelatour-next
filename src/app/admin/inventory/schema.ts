import { z } from "zod";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().min(0, "No puede ser negativo").optional(),
);

const requiredPositive = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Número inválido" }).positive("Debe ser mayor a 0"),
);

export const ItemFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  numero_parte: z.string().max(50).optional().or(z.literal("")),
  codigo: z.string().max(60).optional().or(z.literal("")),
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
  notas: z.string().max(2000).optional().or(z.literal("")),
  // Foto del producto: null explícito = quitarla (stripEmpty deja pasar null).
  foto_url: z.string().max(1000).nullable().optional().or(z.literal("")),
  foto_storage_path: z.string().max(500).nullable().optional().or(z.literal("")),
});

export const TipoMovimientoEnum = z.enum(["ENTRADA", "SALIDA", "DEVOLUCION", "AJUSTE"]);

export const MovimientoFormSchema = z
  .object({
    tipo: TipoMovimientoEnum,
    cantidad: requiredPositive,
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

export type ItemFormValues = {
  nombre: string;
  numero_parte: string;
  codigo: string;
  categoria: string;
  stock_minimo: string;
  ubicacion: string;
  unidad: string;
  notas: string;
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
