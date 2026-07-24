import { z } from "zod";

const CanalEnum = z.enum(["WHATSAPP", "EMAIL", "LANDING", "LLAMADA", "REFERIDO"]);

export const ClientFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  telefono: z
    .string()
    .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  razon_social_default: z.string().max(200).optional().or(z.literal("")),
  rfc: z
    .string()
    .min(12, "RFC mínimo 12")
    .max(13, "RFC máximo 13")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  // Datos fiscales para el CFDI (todos opcionales: se completan cuando el
  // cliente pide factura; el badge de la tabla avisa si faltan).
  regimen_fiscal_receptor: z
    .string()
    .regex(/^\d{3}$/, "Código SAT de 3 dígitos")
    .optional()
    .or(z.literal("")),
  uso_cfdi: z.string().max(5).optional().or(z.literal("")),
  codigo_postal: z
    .string()
    .regex(/^\d{5}$/, "CP de 5 dígitos")
    .optional()
    .or(z.literal("")),
  domicilio_fiscal: z.string().max(500).optional().or(z.literal("")),
  pais_residencia: z.string().max(100).optional().or(z.literal("")),
  canal_origen: CanalEnum.optional().or(z.literal("")),
  es_broker: z.boolean().default(false),
  // Cliente interno (operación propia): OPCIONAL — solo viaja al API si el
  // operador tocó el switch (stripEmpty descarta undefined).
  es_interno: z.boolean().optional(),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type ClientFormValues = z.input<typeof ClientFormSchema>;
