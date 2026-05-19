import { z } from "zod";

export const TIPO_FONDO_OPTIONS = [
  { value: "FIJO", label: "Fondo fijo (administra Mary)" },
  { value: "REINTEGRO", label: "Reintegro (gasta su dinero)" },
] as const;

export const MEDIO_PAGO_FONDO_OPTIONS = [
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "PERSONAL_PABLO", label: "Dinero personal — Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal — Ale" },
] as const;

export const TIPO_MOVIMIENTO_FONDO_OPTIONS = [
  { value: "REPOSICION", label: "Reposición (recarga fondo fijo)" },
  { value: "REINTEGRO", label: "Reintegro (pago de gastos personales)" },
  { value: "AJUSTE", label: "Ajuste" },
] as const;

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const CashFundFormSchema = z.object({
  usuario_id: z.string().uuid("Selecciona una persona"),
  tipo: z.enum(["FIJO", "REINTEGRO"]),
  medio_pago_asociado: z.enum(["EFECTIVO", "PERSONAL_PABLO", "PERSONAL_ALE"]),
  monto_asignado: z.coerce.number().min(0, "≥ 0").default(0),
  moneda: z.enum(["MXN", "USD"]).default("MXN"),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type CashFundFormValues = z.input<typeof CashFundFormSchema>;

export const FundMovementFormSchema = z.object({
  fondo_id: z.string().uuid(),
  tipo: z.enum(["REPOSICION", "REINTEGRO", "AJUSTE"]),
  monto: z.coerce.number().positive("Debe ser mayor a 0"),
  fecha: z.string().optional().or(z.literal("")),
  referencia: z.string().max(100).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type FundMovementFormValues = z.input<typeof FundMovementFormSchema>;
