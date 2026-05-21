import { z } from "zod";

export const InvitePilotSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(100),
  email: z.string().email("Correo inválido"),
  telefono: z
    .string()
    .max(20)
    .optional()
    .or(z.literal("")),
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .optional()
    .or(z.literal("")),
  es_piloto_externo: z.boolean().default(false),
  tiene_fondo_caja: z.boolean().default(false),
});

export type InvitePilotValues = z.input<typeof InvitePilotSchema>;
