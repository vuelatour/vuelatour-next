import { z } from "zod";

export const AMBITO_OPTIONS = [
  { value: "AERONAVE", label: "Aeronave" },
  { value: "PILOTO", label: "Piloto" },
  { value: "MOTOR", label: "Motor" },
] as const;

export const FORMA_OPTIONS = [
  { value: "FECHA", label: "Por fecha" },
  { value: "HORAS", label: "Por horas de vuelo" },
  { value: "PERMANENTE", label: "Permanente (no vence)" },
] as const;

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const DocumentTypeFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(100),
  ambito: z.enum(["AERONAVE", "PILOTO", "MOTOR"]),
  forma_default: z.enum(["FECHA", "HORAS", "PERMANENTE"]).default("FECHA"),
  umbral_alerta_dias: z.coerce.number().int().min(0).max(365).default(30),
  es_critico: z.boolean().default(false),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type DocumentTypeFormValues = z.input<typeof DocumentTypeFormSchema>;
