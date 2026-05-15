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
});

/**
 * Schema compartido entre cliente (RHF) y servidor (Server Action).
 * Soporta dos modos:
 *  - tipo=SIMPLE: par origen→destino + millas + es_redondo_auto
 *  - tipo=MULTIESCALA: arreglo `tramos[]` con al menos 2 elementos, validamos
 *    continuidad (destino[i]===origen[i+1])
 */
export const RouteFormSchema = z
  .object({
    tipo: z.enum(["SIMPLE", "MULTIESCALA"]).default("SIMPLE"),
    origen_iata: z.string().optional().or(z.literal("")),
    destino_iata: z.string().optional().or(z.literal("")),
    millas_nauticas: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    es_redondo_auto: z.boolean().default(true),
    num_aterrizajes: z.coerce
      .number()
      .int("Debe ser entero")
      .min(1, "Mínimo 1 aterrizaje")
      .default(2),
    tramos: z.array(TramoSchema).default([]),
    fuente: z.string().max(50).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.tipo === "SIMPLE") {
      if (!val.origen_iata || val.origen_iata.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["origen_iata"],
          message: "Origen requerido",
        });
      }
      if (!val.destino_iata || val.destino_iata.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destino_iata"],
          message: "Destino requerido",
        });
      }
      if (!val.millas_nauticas || val.millas_nauticas <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["millas_nauticas"],
          message: "Millas náuticas > 0",
        });
      }
      if (
        val.origen_iata &&
        val.destino_iata &&
        val.origen_iata.toUpperCase() === val.destino_iata.toUpperCase()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destino_iata"],
          message: "Origen y destino no pueden ser iguales",
        });
      }
    } else {
      if (val.tramos.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tramos"],
          message: "Agrega al menos 2 tramos",
        });
      }
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
    }
  });

export type RouteFormValues = z.input<typeof RouteFormSchema>;
export type RouteFormOutput = z.output<typeof RouteFormSchema>;
