import { z } from "zod";

export const TIPO_MOVIMIENTO_OPTIONS = [
  { value: "ENTRADA", label: "Entrada (compra / recepción)" },
  { value: "SALIDA", label: "Salida (consumo a aeronave)" },
  { value: "DEVOLUCION", label: "Devolución (regresa a bodega)" },
  { value: "AJUSTE", label: "Ajuste (merma / corrección a la baja)" },
] as const;

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const InventoryItemFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  numero_parte: z.string().max(50).optional().or(z.literal("")),
  categoria: z.string().min(1, "Requerido").max(50),
  stock_minimo: z
    .union([z.coerce.number().min(0, "≥ 0"), z.literal("")])
    .optional(),
  ubicacion: z.string().max(50).default("Bodega Cancun"),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type InventoryItemFormValues = z.input<typeof InventoryItemFormSchema>;

export const InventoryMovementFormSchema = z.object({
  item_id: z.string().uuid(),
  tipo: z.enum(["ENTRADA", "SALIDA", "DEVOLUCION", "AJUSTE"]),
  cantidad: z.coerce.number().positive("Debe ser mayor a 0"),
  costo_unitario_usd: z
    .union([z.coerce.number().min(0, "≥ 0"), z.literal("")])
    .optional(),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  fecha_movimiento: z.string().optional().or(z.literal("")),
  fecha_orden: z.string().optional().or(z.literal("")),
  fecha_cargo_banco: z.string().optional().or(z.literal("")),
  referencia: z.string().max(100).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type InventoryMovementFormValues = z.input<typeof InventoryMovementFormSchema>;
