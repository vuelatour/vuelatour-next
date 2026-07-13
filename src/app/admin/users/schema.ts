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
  es_piloto: z.boolean().default(false),
  es_piloto_externo: z.boolean().default(false),
  telefono: z
    .string()
    .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
    .optional()
    .or(z.literal("")),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

export type UserFormValues = z.input<typeof UserFormSchema>;

/** Alta/invitación de usuario: requiere el email real con el que usará Google. */
export const UserInviteSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(100),
  email: z.string().email("Email inválido").max(200),
  rol: RolEnum,
  estado: EstadoEnum.default("ACTIVO"),
});

export type UserInviteValues = z.input<typeof UserInviteSchema>;
