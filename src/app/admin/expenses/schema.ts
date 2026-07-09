import { z } from "zod";

export const CategoriaEnum = z.enum([
  "GAS",
  "ATERRIZAJE",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "FIJO",
  "OTRO",
]);

export const MedioPagoEnum = z.enum([
  "EFECTIVO",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
  "TRANSFERENCIA",
  // Cargo automático por salida de bodega (no es egreso bancario).
  "BODEGA",
]);

export const EstatusEnum = z.enum(["FACTURA", "VALE", "SIN_COMPROBANTE"]);

export const GastoVerifySchema = z.object({
  // Monto/moneda/fecha editables: si la IA marcó ⚠ discrepancia contra lo
  // que capturó el piloto, la oficina corrige aquí el dato bueno.
  monto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive().optional(),
  ),
  moneda: z.enum(["MXN", "USD"]).optional(),
  fecha_gasto: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  categoria: CategoriaEnum.optional(),
  medio_pago: MedioPagoEnum.optional(),
  estatus_comprobante: EstatusEnum.optional(),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
  duplicado_sospechado: z.boolean().optional(),
});

/** Alta manual de gasto desde el panel (gastos operativos que sube la oficina). */
export const GastoCreateSchema = z.object({
  categoria: CategoriaEnum,
  monto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("El monto debe ser mayor a 0"),
  ),
  moneda: z.enum(["MXN", "USD"]),
  fecha_gasto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha requerida"),
  medio_pago: MedioPagoEnum,
  estatus_comprobante: EstatusEnum.optional(),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  vuelo_id: z.string().uuid().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type GastoCreateValues = {
  categoria: string;
  monto: string;
  moneda: string;
  fecha_gasto: string;
  medio_pago: string;
  estatus_comprobante: string;
  aeronave_id: string;
  proveedor_id: string;
  notas: string;
};

export type GastoVerifyValues = {
  monto: string;
  moneda: string;
  fecha_gasto: string;
  categoria: string;
  medio_pago: string;
  estatus_comprobante: string;
  aeronave_id: string;
  proveedor_id: string;
  notas: string;
};
