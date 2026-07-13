import { z } from "zod";

export const InvitePilotSchema = z
  .object({
    nombre: z.string().min(1, "Requerido").max(100),
    // Piloto EXTERNO: sin acceso al sistema, el email es solo referencia y es
    // opcional. Piloto de base: obligatorio (debe coincidir con su Google).
    email: z.string().email("Correo inválido").optional().or(z.literal("")),
    telefono: z
      .string()
      .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
      .optional()
      .or(z.literal("")),
    tarjeta_terminacion: z
      .string()
      .regex(/^\d{4}$/, "Deben ser 4 dígitos")
      .optional()
      .or(z.literal("")),
    es_piloto_externo: z.boolean().default(false),
    tiene_fondo_caja: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.es_piloto_externo && !v.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Requerido para pilotos con app (debe coincidir con su Google)",
      });
    }
  });

export type InvitePilotValues = z.input<typeof InvitePilotSchema>;
