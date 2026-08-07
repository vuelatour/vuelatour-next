import { z } from "zod";

const nonZeroNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z
    .number({ error: "Número inválido" })
    .refine((n) => n !== 0, "El monto no puede ser cero"),
);

export const MonedaEnum = z.enum(["MXN", "USD"]);
export const TipoMovimientoCajaEnum = z.enum(["REPOSICION", "REINTEGRO", "AJUSTE"]);

export const FondoFormSchema = z.object({
  usuario_id: z.string().uuid("Selecciona una persona"),
  moneda: MonedaEnum.default("MXN"),
  es_acumulada: z.boolean().optional(),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export const FondoUpdateSchema = z.object({
  activo: z.boolean().optional(),
  es_acumulada: z.boolean().optional(),
  moneda: MonedaEnum.optional(),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export const MovimientoFormSchema = z
  .object({
    tipo: TipoMovimientoCajaEnum,
    monto: nonZeroNumber,
    moneda: MonedaEnum.default("MXN"),
    fecha: z.string().optional().or(z.literal("")),
    autorizado_por: z.string().uuid().optional().or(z.literal("")),
    referencia: z.string().max(100).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((d) => d.tipo === "AJUSTE" || (typeof d.monto === "number" && d.monto > 0), {
    message: "Reposición y reintegro deben ser positivos",
    path: ["monto"],
  });

export type FondoFormValues = {
  usuario_id: string;
  moneda: "MXN" | "USD";
  es_acumulada?: boolean;
  notas: string;
};

export type MovimientoFormValues = {
  tipo: "REPOSICION" | "REINTEGRO" | "AJUSTE";
  monto: string;
  moneda: "MXN" | "USD";
  fecha: string;
  autorizado_por: string;
  referencia: string;
  notas: string;
};
