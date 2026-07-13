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
  unidad: z.string().max(30).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
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
    proveedor_id: z.string().uuid().optional().or(z.literal("")),
    fecha_movimiento: z.string().optional().or(z.literal("")),
    fecha_orden: z.string().optional().or(z.literal("")),
    fecha_cargo_banco: z.string().optional().or(z.literal("")),
    referencia: z.string().max(100).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((d) => d.tipo !== "SALIDA" || (!!d.aeronave_id && d.aeronave_id !== ""), {
    message: "La salida debe registrar el avión",
    path: ["aeronave_id"],
  })
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
