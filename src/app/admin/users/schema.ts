import { z } from "zod";

const RolEnum = z.enum([
  "ADMIN",
  "COORDINADOR",
  "ANALISTA",
  "FACTURACION",
  "PILOTO",
  "SOCIO",
  "MECANICO",
]);

const EstadoEnum = z.enum(["ACTIVO", "INACTIVO", "INVITADO"]);

export const UserFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(100),
  rol: RolEnum,
  estado: EstadoEnum,
  tiene_fondo_caja: z.boolean().default(false),
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .optional()
    .or(z.literal("")),
  es_piloto_externo: z.boolean().default(false),
  telefono: z.string().max(20).optional().or(z.literal("")),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

export type UserFormValues = z.input<typeof UserFormSchema>;
