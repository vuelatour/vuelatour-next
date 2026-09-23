"use client";

import Link from "next/link";
import type { UseFormSetValue } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/admin/form-field";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { QuotePlegable } from "@/components/admin/quotes/quote-plegable";
import { fmtMxn, fmtTc, fmtUsd } from "@/lib/format";
import type { QuoteBreakdown } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { QuoteFormValues } from "./quote-form-types";

/**
 * OPERADOR EXTERNO en un `<details>` DEBAJO del papel (Fase 2.3 · BLOQUE C,
 * 22-sep-2026; antes era el sub-bloque «Operador externo» del panel lateral
 * «Interno · no se imprime», que se retiró).
 *
 * Fuera del documento porque NO es un renglón del papel: es la ficha del
 * operador que cubre el servicio y lo que ÉL cobra (costo interno para
 * VuelaTour). El papel sí lleva su ECO en la tarjeta «Avión cotizado» —
 * quién cubre el vuelo se lee arriba, se captura aquí.
 *
 * DOS REGLAS QUE SE CONSERVAN TAL CUAL del panel:
 *
 * 1. **Se AUTO-ABRE al prender «cubierto por externo»** (`forzarAbierto`):
 *    el operador es un campo OBLIGATORIO y no puede quedar escondido detrás
 *    de un triángulo. Igual en revisión de un vuelo que YA es externo.
 * 2. **El contenido nunca se desmonta** (`QuotePlegable` es un `<details>`
 *    nativo): plegarlo no tira lo capturado ni el ancla `seccion-externo`.
 *
 * Aquí NO se calcula precio: el margen es el MISMO cálculo informativo que
 * hacía el panel (lo que paga el cliente según el breakdown − lo que cobra el
 * operador) y jamás viaja al API ni entra a un total.
 */
export function QuoteOperadorExterno({
  lectura,
  isRevise,
  initialQuote,
  values,
  setValue,
  breakdown,
  costoExternoMxnSinTc,
  focusTc,
}: {
  lectura: boolean;
  isRevise: boolean;
  initialQuote?: PersistedQuote;
  values: QuoteFormValues;
  setValue: UseFormSetValue<QuoteFormValues>;
  breakdown: QuoteBreakdown | null;
  /** Costo capturado en MXN sin T.C.: candado de guardado del cotizador. */
  costoExternoMxnSinTc: boolean;
  /** Lleva al T.C. de «Total MXN» del desglose de la hoja. */
  focusTc: () => void;
}) {
  // Margen informativo del vuelo externo. Costo MXN: se convierte con el TC
  // capturado; sin TC no hay margen que mostrar (el candado
  // costoExternoMxnSinTc ya bloquea guardar).
  const costoExtNativo = Number(values.costo_externo_monto) || 0;
  const costoExtEsMxn = values.costo_externo_moneda === "MXN";
  const costoExtTc = Number(values.tc_usd_mxn) || 0;
  const costoExtUsd = costoExtEsMxn
    ? costoExtTc > 0
      ? Math.round((costoExtNativo / costoExtTc) * 100) / 100
      : 0
    : costoExtNativo;
  // El total del preview YA incluye un pactado legado rehidratado (el motor
  // aterriza ahí): el precio al cliente es siempre el total calculado.
  const precioClienteUsd = Number(breakdown?.totales.total_usd) || 0;
  const margenExternoUsd =
    costoExtUsd > 0 && precioClienteUsd > 0
      ? Math.round((precioClienteUsd - costoExtUsd) * 100) / 100
      : null;

  const resumen = values.es_externo
    ? [
        `Cubierto por ${values.operador_externo.trim() || "(sin operador)"}`,
        costoExtNativo > 0
          ? `costo ${costoExtEsMxn ? fmtMxn(costoExtNativo) : fmtUsd(costoExtNativo)}`
          : "sin costo capturado",
        margenExternoUsd != null ? `margen ${fmtUsd(margenExternoUsd)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Vuelo con avión propio — ábrelo si lo cubre otro operador";

  const aviso = costoExternoMxnSinTc
    ? "Costo MXN sin T.C."
    : margenExternoUsd != null && margenExternoUsd < 0
      ? "Margen negativo"
      : null;

  // Margen = lo que paga el cliente − lo que cobra el operador externo (solo
  // informativo; el API es la fuente).
  const margenNode =
    margenExternoUsd != null ? (
      <p
        className={`text-xs ${margenExternoUsd < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}
      >
        Margen VuelaTour: {fmtUsd(precioClienteUsd)} al cliente − {fmtUsd(costoExtUsd)} del
        operador externo
        {costoExtEsMxn && (
          <span className="font-mono">
            {" "}
            ({fmtMxn(costoExtNativo)} ÷ tc {fmtTc(costoExtTc)})
          </span>
        )}{" "}
        = <span className="font-mono font-semibold">{fmtUsd(margenExternoUsd)}</span>
        {margenExternoUsd < 0 && " · el costo supera el precio al cliente"}
      </p>
    ) : null;

  return (
    <QuotePlegable
      id="externo"
      titulo="Operador externo"
      resumen={resumen}
      aviso={aviso}
      forzarAbierto={values.es_externo}
    >
      {/* `seccion-externo` era el ancla del sub-bloque del panel: se conserva
          para que cualquier enlace viejo siga teniendo destino. */}
      <div id="seccion-externo" className="scroll-mt-24 space-y-3">
        {lectura && initialQuote ? (
          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Otro operador vuela este servicio; VuelaTour cobra al cliente y paga al apoyo. Sin
              avión propio ni tacómetros; los gastos sí se registran en el vuelo. El avión cotizado
              es solo la referencia de tarifa.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <DatoExterno
                label="Operador externo"
                value={initialQuote.operador_externo ?? "—"}
                hint="Quién vuela el servicio"
              />
              <DatoExterno
                label="Avión"
                value={
                  [initialQuote.avion_externo_modelo, initialQuote.avion_externo_matricula]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
                hint="Sale en el PDF del cliente"
              />
              <DatoExterno
                label="Lo que cobra el operador externo (costo)"
                value={
                  Number(initialQuote.costo_externo_usd) > 0 ? (
                    <>
                      {fmtUsd(Number(initialQuote.costo_externo_usd))}
                      {initialQuote.costo_externo_moneda === "MXN" &&
                        Number(initialQuote.costo_externo_monto) > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({fmtMxn(Number(initialQuote.costo_externo_monto))}
                            {Number(initialQuote.costo_externo_tc) > 0
                              ? ` · tc ${fmtTc(Number(initialQuote.costo_externo_tc))}`
                              : ""}
                            )
                          </span>
                        )}
                    </>
                  ) : (
                    "Sin capturar"
                  )
                }
                hint="Interno, no lo ve el cliente"
              />
              {Number(initialQuote.calculo_snapshot?.meta?.total_pactado_usd) > 0 && (
                <DatoExterno
                  label="Precio pactado (folio legado)"
                  value={fmtUsd(Number(initialQuote.calculo_snapshot!.meta!.total_pactado_usd))}
                />
              )}
            </div>
            {margenNode}
            <p className="text-[11px] text-muted-foreground">
              El operador y su costo también se editan en{" "}
              <Link
                href={`/admin/flights/${initialQuote.id}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                el vuelo → Editar externo
              </Link>{" "}
              (ahí también se regresa a vuelo propio).
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            {isRevise && initialQuote?.es_externo ? (
              <>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Vuelo cubierto por <strong>{initialQuote.operador_externo}</strong>. El avión
                  cotizado es solo la referencia de tarifa. Aquí capturas lo que cobra el operador
                  externo; lo que se le cobra al cliente es la hoja.
                </div>
                <Field
                  label="Operador externo"
                  hint="Quién vuela el servicio (vacío = se conserva el actual)"
                >
                  <Input
                    placeholder="Ej. Aerocharter del Caribe"
                    maxLength={120}
                    value={values.operador_externo}
                    onChange={(e) => setValue("operador_externo", e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Cubierto por operador externo</Label>
                    <p className="text-xs text-muted-foreground">
                      Otro operador vuela el servicio (ej. venta broker de un jet ajeno). Sin
                      tacómetros; los gastos sí se registran en el vuelo.
                    </p>
                  </div>
                  <Switch
                    checked={values.es_externo}
                    onCheckedChange={(c) => setValue("es_externo", c)}
                  />
                </div>
                {values.es_externo && (
                  <Field label="Operador externo" required hint="Quién vuela el servicio">
                    <Input
                      placeholder="Ej. Aerocharter del Caribe"
                      maxLength={120}
                      value={values.operador_externo}
                      onChange={(e) => setValue("operador_externo", e.target.value)}
                    />
                  </Field>
                )}
              </>
            )}
            {values.es_externo && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Modelo del avión" hint="Sale en el PDF del cliente">
                    <Input
                      placeholder="HAWKER 400 A"
                      maxLength={80}
                      value={values.avion_externo_modelo}
                      onChange={(e) => setValue("avion_externo_modelo", e.target.value)}
                    />
                  </Field>
                  <Field label="Matrícula (opcional)">
                    <Input
                      placeholder="XA-REG"
                      maxLength={20}
                      value={values.avion_externo_matricula}
                      onChange={(e) => setValue("avion_externo_matricula", e.target.value)}
                    />
                  </Field>
                </div>
                <Field
                  label="Lo que cobra el operador externo (costo)"
                  hint="En su moneda · interno, no lo ve el cliente"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      className="font-mono"
                      value={values.costo_externo_monto ?? ""}
                      onChange={(e) =>
                        setValue(
                          "costo_externo_monto",
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        )
                      }
                    />
                    <MonedaSelect
                      value={values.costo_externo_moneda}
                      onChange={(m) => setValue("costo_externo_moneda", m)}
                    />
                  </div>
                  {costoExternoMxnSinTc && (
                    <button
                      type="button"
                      onClick={focusTc}
                      className="mt-1 cursor-pointer text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
                    >
                      Costo en MXN: captura el T.C. en «Total MXN» del desglose — sin tipo de
                      cambio no se puede derivar el USD ni guardar.
                    </button>
                  )}
                </Field>
                {margenNode}
              </>
            )}
          </div>
        )}
      </div>
    </QuotePlegable>
  );
}

/** Etiqueta + valor en lectura (el `Dato` que vivía en el panel). */
function DatoExterno({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
