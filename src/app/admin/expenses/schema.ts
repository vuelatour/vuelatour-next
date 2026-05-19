import { z } from "zod";

export const CATEGORIA_OPTIONS = [
  { value: "GAS", label: "Combustible" },
  { value: "ATERRIZAJE", label: "Aterrizaje" },
  { value: "TUAS", label: "TUAS" },
  { value: "FBO", label: "FBO" },
  { value: "COMIDA", label: "Comida" },
  { value: "HOTEL", label: "Hotel" },
  { value: "TAXI", label: "Taxi" },
  { value: "REFACCION", label: "Refacción" },
  { value: "PERMISO", label: "Permiso" },
  { value: "FIJO", label: "Gasto fijo" },
  { value: "OTRO", label: "Otro" },
] as const;

export const MEDIO_PAGO_OPTIONS = [
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal — Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal — Ale" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
] as const;

export const ESTATUS_COMPROBANTE_OPTIONS = [
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale" },
  { value: "SIN_COMPROBANTE", label: "Sin comprobante" },
] as const;

export const MONEDA_OPTIONS = [
  { value: "MXN", label: "MXN — Pesos" },
  { value: "USD", label: "USD — Dólares" },
] as const;

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const GastoFormSchema = z.object({
  categoria: z.enum([
    "GAS",
    "ATERRIZAJE",
    "TUAS",
    "FBO",
    "COMIDA",
    "HOTEL",
    "TAXI",
    "REFACCION",
    "PERMISO",
    "FIJO",
    "OTRO",
  ]),
  fecha_gasto: z.string().min(1, "Requerido"),
  monto: z.coerce.number().positive("Debe ser mayor a 0"),
  moneda: z.enum(["MXN", "USD"]).default("MXN"),
  tc_gasto: z
    .union([z.coerce.number().positive("Debe ser mayor a 0"), z.literal("")])
    .optional(),
  medio_pago: z.enum([
    "EFECTIVO",
    "TARJETA_CORP",
    "PERSONAL_PABLO",
    "PERSONAL_ALE",
    "TRANSFERENCIA",
  ]),
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .optional()
    .or(z.literal("")),
  estatus_comprobante: z
    .enum(["FACTURA", "VALE", "SIN_COMPROBANTE"])
    .default("SIN_COMPROBANTE"),
  aeronave_id: z.string().uuid("Aeronave inválida").optional().or(z.literal("")),
  vuelo_id: z.string().uuid("Vuelo inválido").optional().or(z.literal("")),
  proveedor_id: z.string().uuid("Proveedor inválido").optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type GastoFormValues = z.input<typeof GastoFormSchema>;
export type GastoFormOutput = z.output<typeof GastoFormSchema>;
