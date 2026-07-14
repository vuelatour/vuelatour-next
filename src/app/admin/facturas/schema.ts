import { z } from "zod";

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

const optionalStr = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Receptor alterno opcional "SE FACTURÓ A". Si se llena RFC, los demás son requeridos. */
export const EmitirFacturaSchema = z
  .object({
    vuelo_id: z.string().uuid(),
    entidad_fiscal_emisora_id: z.string().uuid({ message: "Selecciona la entidad emisora" }),
    facturado_a_rfc: z
      .string()
      .trim()
      .refine((v) => v === "" || RFC_RE.test(v), { message: "RFC inválido" })
      .optional()
      .or(z.literal("")),
    facturado_a_nombre: optionalStr(200),
    facturado_a_regimen: optionalStr(5),
    facturado_a_cp: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{5}$/.test(v), { message: "CP de 5 dígitos" })
      .optional()
      .or(z.literal("")),
    facturado_a_uso_cfdi: optionalStr(5),
    publico_en_general: z.boolean().optional(),
    periodicidad: z.enum(["01", "02", "03", "04"]).optional(),
    /** MXN por USD — requerido por el API cuando el vuelo no tiene monto MXN. */
    tc_usd_mxn: z.coerce
      .number({ error: "Tipo de cambio inválido" })
      .positive({ message: "El tipo de cambio debe ser mayor a 0" })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.facturado_a_rfc && val.facturado_a_rfc.length > 0) {
      const required = [
        "facturado_a_nombre",
        "facturado_a_regimen",
        "facturado_a_cp",
        "facturado_a_uso_cfdi",
      ] as const;
      for (const key of required) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "Requerido si capturas 'SE FACTURÓ A'",
          });
        }
      }
    }
  });

export type EmitirFacturaValues = z.input<typeof EmitirFacturaSchema>;

export const CancelarFacturaSchema = z
  .object({
    motivo: z.enum(["01", "02", "03", "04"]),
    folio_sustitucion: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.motivo === "01" && !val.folio_sustitucion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["folio_sustitucion"],
        message: "El motivo 01 requiere el UUID de la factura que la sustituye",
      });
    }
  });

export type CancelarFacturaValues = z.input<typeof CancelarFacturaSchema>;

export const NotaCreditoSchema = z.object({
  factura_id: z.string().uuid(),
  monto: z.coerce.number().positive().optional(),
  descripcion: optionalStr(1000),
});

export type NotaCreditoValues = z.input<typeof NotaCreditoSchema>;
