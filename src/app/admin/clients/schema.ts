import { z } from "zod";

const CanalEnum = z.enum(["WHATSAPP", "EMAIL", "LANDING", "LLAMADA", "REFERIDO"]);

export const ClientFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  telefono: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  razon_social_default: z.string().max(200).optional().or(z.literal("")),
  rfc: z
    .string()
    .min(12, "RFC mínimo 12")
    .max(13, "RFC máximo 13")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  canal_origen: CanalEnum.optional().or(z.literal("")),
  es_broker: z.boolean().default(false),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type ClientFormValues = z.input<typeof ClientFormSchema>;
