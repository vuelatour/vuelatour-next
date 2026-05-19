import { z } from "zod";

export const TIPO_MOVIMIENTO_BANCARIO_OPTIONS = [
  { value: "CARGO", label: "Cargo (salida)" },
  { value: "ABONO", label: "Abono (entrada)" },
] as const;

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const BankMovementFormSchema = z.object({
  cuenta_bancaria_id: z.string().uuid("Selecciona una cuenta"),
  fecha: z.string().min(1, "Requerido"),
  tipo: z.enum(["CARGO", "ABONO"]),
  monto: z.coerce.number().positive("Debe ser mayor a 0"),
  descripcion: z.string().max(500).optional().or(z.literal("")),
  referencia: z.string().max(120).optional().or(z.literal("")),
  saldo_posterior: z
    .union([z.coerce.number(), z.literal("")])
    .optional(),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type BankMovementFormValues = z.input<typeof BankMovementFormSchema>;
