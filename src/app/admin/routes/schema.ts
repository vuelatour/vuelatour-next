import { z } from "zod";

const IataSchema = z
  .string()
  .min(3, "Mínimo 3 caracteres")
  .max(4, "Máximo 4 caracteres")
  .transform((v) => v.toUpperCase());

const TramoSchema = z.object({
  origen_iata: IataSchema,
  destino_iata: IataSchema,
  millas_nauticas: z.coerce.number().positive("Debe ser mayor a 0"),
  // Detalle por tramo (defaults de plantilla).
  pasajeros: z.coerce.number().int().min(0).nullish(),
  es_ferry: z.boolean().default(false),
  requiere_pernocta: z.boolean().default(false),
  pernocta_costo_usd: z.coerce.number().min(0).nullish(),
  tipo_parada: z.enum(["NORMAL", "SERVICIO"]).default("NORMAL"),
  servicio_notas: z.string().max(500).nullish(),
});

/**
 * Schema compartido entre cliente (RHF) y servidor (Server Action).
 *
 * Las rutas son SIEMPRE personalizadas (por tramos): quien crea la ruta arma el
 * itinerario completo, incluido el regreso si aplica (decisión operativa). Ya no
 * existen los modos "redondo automático" ni la distinción SIMPLE/MULTIESCALA en
 * el formulario; el backend las guarda como MULTIESCALA.
 */
export const RouteFormSchema = z
  .object({
    tramos: z.array(TramoSchema).min(1, "Agrega al menos 1 tramo"),
    fuente: z.string().max(50).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    for (let i = 0; i < val.tramos.length - 1; i++) {
      const a = val.tramos[i].destino_iata.toUpperCase();
      const b = val.tramos[i + 1].origen_iata.toUpperCase();
      if (a !== b) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tramos", i + 1, "origen_iata"],
          message: `Debe coincidir con destino del tramo ${i + 1} (${a})`,
        });
      }
    }
    // Mismo aeropuerto en un tramo = SOBREVUELO (CUN→CUN): permitido — las
    // millas definen el tiempo cobrado y la escala nace marcada sobrevuelo.
  });

export type RouteFormValues = z.input<typeof RouteFormSchema>;
export type RouteFormOutput = z.output<typeof RouteFormSchema>;
