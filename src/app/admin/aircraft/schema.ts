import { z } from "zod";

const PaisEnum = z.enum(["MX", "USA"]);

/** Number opcional: "" o undefined → se omite; en otro caso coacciona a número ≥ 0. */
const optionalNonNegative = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0, "No puede ser negativo").optional(),
);

export const AircraftFormSchema = z.object({
  matricula: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(10, "Máximo 10 caracteres")
    .transform((v) => v.trim().toUpperCase()),
  modelo: z.string().min(1, "Requerido").max(50),
  pais_registro: PaisEnum,
  num_motores: z.coerce.number().int("Entero").min(1, "Mínimo 1").max(2, "Máximo 2"),
  velocidad_crucero_kts: z.coerce.number().min(1, "Debe ser mayor a 0"),
  asientos: z.coerce.number().int("Entero").min(1, "Debe ser mayor a 0"),
  tarifa_hora_pub_usd: optionalNonNegative,
  tarifa_hora_broker_usd: optionalNonNegative,
  reserva_overhaul_hr_usd: optionalNonNegative,
  color_calendario: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Formato #RRGGBB")
    .optional()
    .or(z.literal("")),
  ubicacion_base: z
    .string()
    .min(3, "3-4 letras")
    .max(4, "3-4 letras")
    .transform((v) => v.trim().toUpperCase())
    .optional()
    .or(z.literal("")),
  activa: z.boolean().default(true),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type AircraftFormValues = z.input<typeof AircraftFormSchema>;
