"use client";

import { useEffect, useRef, useState } from "react";
import { PaperClipIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { CuentaGastoSelector } from "@/components/admin/expenses/cuenta-gasto-selector";
import { ProveedorSelector } from "@/components/admin/expenses/proveedor-selector";
import { listCardsOptionsAction, type CardOption } from "@/app/admin/users/actions";
import { ETIQUETA_CAMPO_CUENTA, HINT_CUENTA, medioLlevaCuenta } from "@/lib/admin/cuentas-gasto";
import { MEDIOS_CAPTURA, ayudaMedioPago } from "@/lib/admin/medios-pago";
import { nombreCorto } from "@/lib/admin/comprobante-hojas";
import {
  ETIQUETA_COMPROBANTE,
  ETIQUETA_FECHA_PAGO_COMPRA,
  ETIQUETA_FOLIO_COMPRA,
  ETIQUETA_TC_COMPRA,
  HINT_COMPROBANTE,
  HINT_FECHA_PAGO_COMPRA,
  HINT_FOLIO_COMPRA,
  MSG_MEDIO_REQUERIDO,
  hintTcSugerido,
  validarTcCompra,
  type FormGastoCompra,
} from "@/lib/admin/compras-estado";

/** Foto, PDF: lo mismo que acepta el bucket `gasto-fotos` para un comprobante (sin Excel aquí). */
const ACEPTA_COMPROBANTE = "image/jpeg,image/png,image/webp,application/pdf";

/**
 * Los campos del GASTO de una compra (4-nov-2026, API 0.0.120): T.C.
 * obligatorio y sugerido, fecha y medio del pago, tarjeta o cuenta según el
 * medio, proveedor, folio, comprobante y notas. Los comparten «Registrar
 * gasto» (la factura de las refacciones), «Agregar gasto» (el envío, la
 * aduana…) y «Ya la pagué» de Registrar compra, para que los tres se vean y
 * se validen igual (`cuerpoRegistrarGastoCompra` / `cuerpoAgregarGastoCompra`).
 * Estado controlado por quien lo monta; aquí no se calcula nada.
 */
export function CompraGastoCampos({
  form,
  onChange,
  providers,
  tcOficialHoy = null,
  archivo,
  onArchivo,
  hintTc,
  mostrarProveedor = true,
  hintProveedor,
  mostrarFolio = true,
  mostrarNotas = true,
}: {
  form: FormGastoCompra;
  onChange: (patch: Partial<FormGastoCompra>) => void;
  providers: { id: string; nombre: string }[];
  /** T.C. oficial de hoy (sugerencia; null = sin dato). */
  tcOficialHoy?: number | null;
  /** El comprobante elegido (se sube al guardar, no antes). */
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  /** Ayuda del T.C. distinta de la de siempre (p. ej. «Agregar gasto»). */
  hintTc?: string;
  mostrarProveedor?: boolean;
  hintProveedor?: string;
  mostrarFolio?: boolean;
  mostrarNotas?: boolean;
}) {
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);

  // Tarjetas del catálogo para «¿con qué tarjeta?» (solo TARJETA_CORP).
  useEffect(() => {
    let cancel = false;
    void listCardsOptionsAction().then((res) => {
      if (!cancel && res.ok && res.data) setCardOptions(res.data);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const tcValido = validarTcCompra(form.tc);

  return (
    <div className="space-y-3" data-campos-gasto-compra>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field
          label={ETIQUETA_TC_COMPRA}
          required
          hint={hintTc ?? hintTcSugerido(tcOficialHoy)}
          error={form.tc.trim() !== "" && !tcValido.ok ? tcValido.error : undefined}
        >
          <Input
            type="number"
            step="0.0001"
            min="0"
            inputMode="decimal"
            value={form.tc}
            onChange={(e) => onChange({ tc: e.target.value })}
            placeholder="Ej. 18.25"
            data-tc-compra
          />
        </Field>
        <Field label={ETIQUETA_FECHA_PAGO_COMPRA} required hint={HINT_FECHA_PAGO_COMPRA}>
          <Input type="date" value={form.fecha} onChange={(e) => onChange({ fecha: e.target.value })} />
        </Field>
        <Field label="Medio de pago" required hint={ayudaMedioPago(form.medio) ?? undefined}>
          <SearchableSelect
            options={MEDIOS_CAPTURA}
            value={form.medio}
            onChange={(v) =>
              onChange({
                medio: v,
                ...(v !== "TARJETA_CORP" ? { tarjeta: "" } : {}),
                ...(!medioLlevaCuenta(v) ? { cuenta: "" } : {}),
              })
            }
            placeholder={MSG_MEDIO_REQUERIDO}
          />
        </Field>
        {form.medio === "TARJETA_CORP" ? (
          <Field label="¿Con qué tarjeta?" hint="vacío = la asignada a quien registra">
            <SearchableSelect
              options={[
                { value: "", label: "Automática (asignada al capturador)" },
                ...cardOptions.map((c) => ({
                  value: c.terminacion,
                  label: `**** ${c.terminacion} · ${c.nombre_titular}`,
                })),
              ]}
              value={form.tarjeta}
              onChange={(v) => onChange({ tarjeta: v })}
              placeholder="Automática"
            />
          </Field>
        ) : medioLlevaCuenta(form.medio) ? (
          <Field label={ETIQUETA_CAMPO_CUENTA} hint={HINT_CUENTA}>
            <CuentaGastoSelector
              key={form.medio}
              medio={form.medio}
              value={form.cuenta}
              onChange={(v) => onChange({ cuenta: v })}
            />
          </Field>
        ) : (
          <div />
        )}
        {mostrarProveedor && (
          <Field label="Proveedor" hint={hintProveedor}>
            <ProveedorSelector providers={providers} value={form.proveedor} onChange={(v) => onChange({ proveedor: v })} />
          </Field>
        )}
        {mostrarFolio && (
          <Field label={ETIQUETA_FOLIO_COMPRA} hint={HINT_FOLIO_COMPRA}>
            <Input value={form.folio} onChange={(e) => onChange({ folio: e.target.value })} maxLength={60} />
          </Field>
        )}
      </div>
      <Field label={ETIQUETA_COMPROBANTE} hint={HINT_COMPROBANTE}>
        <ComprobanteArchivo archivo={archivo} onArchivo={onArchivo} />
      </Field>
      {mostrarNotas && (
        <Field label="Notas">
          <Textarea rows={2} value={form.notas} onChange={(e) => onChange({ notas: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

/**
 * Un archivo (foto o PDF) elegido en el navegador: se sube al guardar con
 * `uploadGastoComprobante` (mismo bucket y mismas reglas que el alta de
 * gasto). Sin arrastrar ni IA: la factura de la compra ya se capturó a mano.
 */
export function ComprobanteArchivo({
  id,
  archivo,
  onArchivo,
}: {
  /** Lo pone `Field` (clona a su único hijo) para ligar la etiqueta. */
  id?: string;
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2" data-comprobante-archivo>
      <input
        id={id}
        ref={ref}
        type="file"
        accept={ACEPTA_COMPROBANTE}
        className="sr-only"
        onChange={(e) => {
          onArchivo(e.target.files?.[0] ?? null);
          // Permite volver a elegir el mismo archivo tras quitarlo.
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => ref.current?.click()}>
        <PaperClipIcon className="h-4 w-4" />
        {archivo ? "Cambiar archivo" : "Elegir archivo"}
      </Button>
      {archivo ? (
        <span className="inline-flex items-center gap-1 text-sm">
          <span className="truncate" title={archivo.name}>
            {nombreCorto(archivo.name)}
          </span>
          <button
            type="button"
            onClick={() => onArchivo(null)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Quitar el archivo"
            aria-label="Quitar el archivo"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Ningún archivo elegido.</span>
      )}
    </div>
  );
}
