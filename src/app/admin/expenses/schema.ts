import { z } from "zod";

export const CategoriaEnum = z.enum([
  "GAS",
  "ATERRIZAJE",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "FIJO",
  "OTRO",
]);

export const MedioPagoEnum = z.enum([
  "EFECTIVO",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
  "TRANSFERENCIA",
]);

export const EstatusEnum = z.enum(["FACTURA", "VALE", "SIN_COMPROBANTE"]);

export const GastoVerifySchema = z.object({
  categoria: CategoriaEnum.optional(),
  medio_pago: MedioPagoEnum.optional(),
  estatus_comprobante: EstatusEnum.optional(),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
  duplicado_sospechado: z.boolean().optional(),
});

export type GastoVerifyValues = {
  categoria: string;
  medio_pago: string;
  estatus_comprobante: string;
  aeronave_id: string;
  proveedor_id: string;
  notas: string;
};
