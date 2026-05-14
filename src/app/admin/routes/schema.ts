import { z } from "zod";

/**
 * Schema compartido entre cliente (RHF) y servidor (Server Action).
 * El backend tambien valida con class-validator; este schema solo cubre
 * el shape esperado del form antes de pegarle al API.
 */
export const RouteFormSchema = z.object({
  origen_iata: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(4, "Máximo 4 caracteres")
    .transform((v) => v.toUpperCase()),
  destino_iata: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(4, "Máximo 4 caracteres")
    .transform((v) => v.toUpperCase()),
  millas_nauticas: z.coerce.number().positive("Debe ser mayor a 0"),
  es_redondo_auto: z.boolean().default(true),
  num_aterrizajes: z.coerce
    .number()
    .int("Debe ser entero")
    .min(1, "Mínimo 1 aterrizaje")
    .default(2),
  fuente: z.string().max(50).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type RouteFormValues = z.input<typeof RouteFormSchema>;
export type RouteFormOutput = z.output<typeof RouteFormSchema>;
