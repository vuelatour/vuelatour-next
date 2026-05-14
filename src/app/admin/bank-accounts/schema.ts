import { z } from "zod";

const MonedaEnum = z.enum(["MXN", "USD"]);
const RazonEnum = z.enum(["AEROCHARTER", "AERODINAMICA", "OTRA"]);

export const BankAccountFormSchema = z.object({
  alias: z.string().min(1, "Requerido").max(50),
  banco: z.string().min(1, "Requerido").max(50),
  numero_cuenta: z.string().max(30).optional().or(z.literal("")),
  clabe: z.string().length(18, "CLABE son 18 dígitos").optional().or(z.literal("")),
  moneda: MonedaEnum,
  razon_social: RazonEnum,
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type BankAccountFormValues = z.input<typeof BankAccountFormSchema>;
