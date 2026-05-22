import { z } from "zod";

export const AirportFormSchema = z.object({
  iata: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(4, "Máximo 4 caracteres")
    .transform((v) => v.toUpperCase()),
  icao: z
    .string()
    .length(4, "ICAO son 4 caracteres")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  nombre: z.string().min(1, "Requerido").max(100),
  ciudad: z.string().max(100).optional().or(z.literal("")),
  pais: z
    .string()
    .length(2, "ISO 2 letras")
    .transform((v) => v.toUpperCase())
    .default("MX"),
  latitud: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(-90, "-90 a 90").max(90, "-90 a 90").optional(),
  ),
  longitud: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(-180, "-180 a 180").max(180, "-180 a 180").optional(),
  ),
  tuas_default_usd_pax: z.coerce.number().min(0, "≥ 0").default(25),
  tuas_aplica_xa: z.boolean().default(true),
  tuas_aplica_xb: z.boolean().default(true),
  tuas_aplica_n: z.boolean().default(true),
  tuas_pase_abordar_exenta: z.boolean().default(true),
  requiere_permiso: z.boolean().default(false),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type AirportFormValues = z.input<typeof AirportFormSchema>;
export type AirportFormOutput = z.output<typeof AirportFormSchema>;
