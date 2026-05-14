import { z } from "zod";

const TipoEnum = z.enum(["NACIONAL", "EXTRANJERO", "GENERICO_LOCAL"]);

export const ProviderFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  rfc: z
    .string()
    .min(12, "RFC mínimo 12")
    .max(13, "RFC máximo 13")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  tipo: TipoEnum.default("NACIONAL"),
  pais: z
    .string()
    .length(2, "ISO 2 letras")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().max(20).optional().or(z.literal("")),
  direccion: z.string().max(2000).optional().or(z.literal("")),
  contacto: z.string().max(100).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type ProviderFormValues = z.input<typeof ProviderFormSchema>;
