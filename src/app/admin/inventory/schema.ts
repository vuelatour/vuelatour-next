import { z } from "zod";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().min(0, "No puede ser negativo").optional(),
);

const requiredPositive = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Número inválido" }).positive("Debe ser mayor a 0"),
);

export const ItemFormSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  numero_parte: z.string().max(50).optional().or(z.literal("")),
  codigo: z.string().max(60).optional().or(z.literal("")),
  categoria: z.string().min(1, "Requerido").max(50),
  stock_minimo: optionalNumber,
  ubicacion: z.string().max(50).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export const TipoMovimientoEnum = z.enum(["ENTRADA", "SALIDA", "DEVOLUCION", "AJUSTE"]);

export const MovimientoFormSchema = z
  .object({
    tipo: TipoMovimientoEnum,
    cantidad: requiredPositive,
    costo_unitario_usd: optionalNumber,
    aeronave_id: z.string().uuid().optional().or(z.literal("")),
    proveedor_id: z.string().uuid().optional().or(z.literal("")),
    fecha_movimiento: z.string().optional().or(z.literal("")),
    fecha_orden: z.string().optional().or(z.literal("")),
    fecha_cargo_banco: z.string().optional().or(z.literal("")),
    referencia: z.string().max(100).optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((d) => d.tipo !== "SALIDA" || (!!d.aeronave_id && d.aeronave_id !== ""), {
    message: "La salida debe registrar el avión",
    path: ["aeronave_id"],
  })
  .refine((d) => d.tipo === "SALIDA" || d.costo_unitario_usd != null, {
    message: "El costo unitario es requerido",
    path: ["costo_unitario_usd"],
  });

export type ItemFormValues = {
  nombre: string;
  numero_parte: string;
  codigo: string;
  categoria: string;
  stock_minimo: string;
  ubicacion: string;
  notas: string;
};

export type MovimientoFormValues = {
  tipo: "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";
  cantidad: string;
  costo_unitario_usd: string;
  aeronave_id: string;
  proveedor_id: string;
  fecha_movimiento: string;
  referencia: string;
  notas: string;
};
