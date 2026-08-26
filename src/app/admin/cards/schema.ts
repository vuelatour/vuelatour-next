import { z } from "zod";

export const CardFormSchema = z.object({
  terminacion: z
    .string()
    .regex(/^\d{4}$/, "Deben ser exactamente 4 dígitos"),
  nombre_titular: z.string().min(1, "Requerido").max(100),
  // null explícito = DESVINCULAR (sobrevive al stripEmpty del action).
  usuario_id: z
    .string()
    .uuid("UUID inválido")
    .nullable()
    .optional()
    .or(z.literal("")),
  banco: z.string().max(50).optional().or(z.literal("")),
  cuenta_bancaria_id: z.string().uuid("UUID inválido").optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type CardFormValues = z.input<typeof CardFormSchema>;
