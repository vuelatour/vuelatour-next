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
  // `tiene_fondo_caja` NO está aquí (2-oct-2026): lo mantiene Caja chica
  // («Abrir fondo») y marcarlo a mano dejaba a la persona fuera de ese
  // selector. Al no estar en el schema, zod lo descarta si llegara.
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
  // SIN `.default(false)` (revisión 2-oct-2026): con zod 4 el default se
  // aplica aunque el campo sea opcional, también en `.partial()`, y
  // `updateUserAction` volvía a meter `es_piloto: false` /
  // `es_piloto_externo: false` en CADA guardado de Usuarios — Pablo y
  // Alejandro Canales perdían el doble rol y los externos quedaban INVITADO.
  // El formulario ya los recibe de `defaults(user)`; ausente = no viaja.
  es_piloto: z.boolean().optional(),
  es_piloto_externo: z.boolean().optional(),
  telefono: z
    .string()
    .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
    .optional()
    .or(z.literal("")),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

export type UserFormValues = z.input<typeof UserFormSchema>;

/**
 * «Editar datos» del piloto (2-oct-2026): SOLO lo que la coordinación puede
 * cambiar (el API rechaza lo demás con 403 `SOLO_ADMIN_EDITA_USUARIOS`). Lo
 * usan el diálogo en modo piloto y `updatePilotAction`.
 */
export const PilotoDatosSchema = UserFormSchema.pick({
  nombre: true,
  apodo: true,
  telefono: true,
  tarjeta_terminacion: true,
});

export type PilotoDatosValues = z.input<typeof PilotoDatosSchema>;

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
