import { z } from "zod";

export const ESTADO_OPTIONS = [
  { value: "VIGENTE", label: "Vigente" },
  { value: "PROXIMO", label: "Próximo a vencer" },
  { value: "VENCIDO", label: "Vencido" },
  { value: "PERMANENTE", label: "Permanente" },
  { value: "INDETERMINADO", label: "Sin dato" },
] as const;

export const ExpirationFormSchema = z.object({
  tipo_documento_id: z.string().uuid("Selecciona un tipo de documento"),
  vence_por: z.enum(["FECHA", "HORAS", "PERMANENTE"]),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  piloto_id: z.string().uuid().optional().or(z.literal("")),
  motor_id: z.string().uuid().optional().or(z.literal("")),
  // null explícito = limpiar la fecha calendario de un "por horas" al editar.
  fecha_vencimiento: z.string().nullable().optional().or(z.literal("")),
  horas_limite: z
    .union([z.coerce.number().positive("Debe ser mayor a 0"), z.literal("")])
    .optional(),
  umbral_alerta_dias: z
    .union([z.coerce.number().int().min(0).max(365), z.literal("")])
    .optional(),
  // Override por documento del "crítico" del tipo (las reglas cambian por
  // semana): true/false = manda sobre el tipo; ausente = no tocar.
  critico: z.boolean().nullable().optional(),
  referencia: z.string().max(100).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
  // PATH del archivo adjunto en el bucket privado; null = quitar al editar.
  archivo_url: z.string().nullable().optional(),
});

export type ExpirationFormValues = z.input<typeof ExpirationFormSchema>;
