import { z } from "zod";
import { APODO_MAX } from "@/lib/admin/usuario-apodo";

const RolEnum = z.enum([
  "ADMIN",
  "COORDINADOR",
  "ANALISTA",
  "FACTURACION",
  "PILOTO",
  "SOCIO",
  "MECANICO",
  "VISITANTE",
]);

const EstadoEnum = z.enum(["ACTIVO", "INACTIVO", "INVITADO"]);

export const UserFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(100),
  rol: RolEnum,
  estado: EstadoEnum,
  tiene_fondo_caja: z.boolean().default(false),
  // null explícito = DESVINCULAR la tarjeta (sobrevive al stripEmpty del
  // action; "" se descartaría y quitarla sería un no-op silencioso).
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .nullable()
    .optional()
    .or(z.literal("")),
  // Nombre corto para el título del evento de Google Calendar (17-sep-2026).
  // null explícito = BORRARLO (sobrevive al stripEmpty del action; el "" se
  // descartaría y vaciarlo sería un no-op silencioso). Tope = @MaxLength del
  // DTO del API.
  apodo: z
    .string()
    .max(APODO_MAX, `Máximo ${APODO_MAX} caracteres`)
    .nullable()
    .optional(),
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
  /** Opcional en el alta: se puede capturar después al editar. */
  apodo: z.string().max(APODO_MAX, `Máximo ${APODO_MAX} caracteres`).optional(),
});

export type UserInviteValues = z.input<typeof UserInviteSchema>;
