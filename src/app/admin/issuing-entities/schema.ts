import { z } from "zod";

export const IssuingEntityFormSchema = z.object({
  codigo: z
    .string()
    .min(1, "Requerido")
    .max(20)
    .transform((v) => v.toUpperCase()),
  razon_social: z.string().min(1, "Requerido").max(200),
  rfc: z
    .string()
    .min(12, "RFC mínimo 12")
    .max(13, "RFC máximo 13")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  regimen_fiscal_sat: z.string().max(10).optional().or(z.literal("")),
  codigo_postal: z.string().length(5, "CP de 5 dígitos").optional().or(z.literal("")),
  direccion: z.string().max(2000).optional().or(z.literal("")),
  email_facturacion: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z
    .string()
    .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
    .optional()
    .or(z.literal("")),
  pac_proveedor: z.string().max(50).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type IssuingEntityFormValues = z.input<typeof IssuingEntityFormSchema>;
