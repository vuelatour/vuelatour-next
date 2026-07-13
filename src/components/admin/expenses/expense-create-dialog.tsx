"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { PlusIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createGastoAction,
  buscarVuelosCercanosAction,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import { Field } from "@/components/admin/form-field";

const CATEGORIAS = [
  { value: "GAS", label: "GAS" },
  { value: "OPERACIONES", label: "OPERACIONES" },
  { value: "TUAS", label: "TUAS" },
  { value: "FBO", label: "FBO" },
  { value: "COMIDA", label: "COMIDA" },
  { value: "HOTEL", label: "HOTEL" },
  { value: "TAXI", label: "TAXI" },
  { value: "REFACCION", label: "REFACCION" },
  { value: "PERMISO", label: "PERMISO" },
  // Honorario del freelance que voló el avión (doc 3.7): resta en el reparto
  // como gasto directo del vuelo.
  { value: "PILOTO_EXTERNO", label: "Piloto externo (honorario)" },
  { value: "FIJO", label: "FIJO" },
  { value: "OTRO", label: "OTRO" },
];

const MEDIOS = [
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
];

const ESTATUS = [
  { value: "SIN_COMPROBANTE", label: "Sin comprobante (factura por llegar)" },
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
];

/** Hoy en hora Cancún (UTC−5 fija) para el default del formulario. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function emptyValues(defaults?: {
  vueloId?: string;
  aeronaveId?: string;
  categoria?: string;
}): GastoCreateValues {
  return {
    categoria: defaults?.categoria ?? "OPERACIONES",
    monto: "",
    moneda: "MXN",
    fecha_gasto: hoyCancun(),
    medio_pago: "TRANSFERENCIA",
    estatus_comprobante: "SIN_COMPROBANTE",
    aeronave_id: defaults?.aeronaveId ?? "",
    vuelo_id: defaults?.vueloId ?? "",
    proveedor_id: "",
    tc_gasto: "",
    notas: "",
  };
}

/** Alta manual de gasto operativo desde el panel (lo sube administración). */
export function ExpenseCreateDialog({
  aircraft,
  providers,
  defaultVueloId,
  defaultVueloFolio,
  defaultAeronaveId,
  defaultCategoria,
}: {
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Con vuelo: el gasto queda LIGADO (reporte por vuelo, reparto, pre-cierre). */
  defaultVueloId?: string;
  defaultVueloFolio?: number;
  defaultAeronaveId?: string;
  defaultCategoria?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Factura/recibo adjunto (foto o PDF): se sube al bucket privado al guardar.
  const [factura, setFactura] = useState<File | null>(null);
  const facturaRef = useRef<HTMLInputElement>(null);
  // Vuelos alrededor de la fecha del gasto (±15 días), para dejarlo LIGADO al
  // vuelo desde el alta — pedido del cliente: los gastos viven en su vuelo.
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);
  const formDefaults = {
    vueloId: defaultVueloId,
    aeronaveId: defaultAeronaveId,
    categoria: defaultCategoria,
  };
  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoCreateValues>({
    defaultValues: emptyValues(formDefaults),
  });

  const fechaGasto = watch("fecha_gasto");
  useEffect(() => {
    // Con vuelo prefijado (alta desde el detalle del vuelo) no hace falta lista.
    if (!open || defaultVueloId) return;
    let cancel = false;
    buscarVuelosCercanosAction(fechaGasto).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, defaultVueloId, fechaGasto]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // Primero el archivo: si la subida falla, no se crea el gasto a medias.
      let fotoPath = "";
      if (factura) {
        try {
          fotoPath = await uploadGastoComprobante(factura);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo subir la factura");
          return;
        }
      }
      const result = await createGastoAction({ ...values, foto_url: fotoPath });
      if (result.ok) {
        toast.success(factura ? "Gasto registrado con su factura" : "Gasto registrado");
        setFactura(null);
        if (facturaRef.current) facturaRef.current.value = "";
        reset(emptyValues(formDefaults));
        setOpen(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        {defaultVueloId ? "Registrar gasto" : "Nuevo gasto"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo gasto (oficina)</DialogTitle>
            <DialogDescription>
              {defaultVueloId ? (
                <>
                  Se liga al vuelo{defaultVueloFolio != null ? ` #${defaultVueloFolio}` : ""}:
                  entra a su reporte y resta en el reparto (ej. honorario del piloto externo).
                </>
              ) : (
                <>
                  Captura manual de un gasto operativo. Queda marcado como subido por
                  administración; si la factura llega después, se amarra en Facturas recibidas.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  {...register("monto")}
                />
              </Field>
              <Field label="Moneda">
                <SearchableSelect
                  options={[
                    { value: "MXN", label: "MXN" },
                    { value: "USD", label: "USD" },
                  ]}
                  value={watch("moneda")}
                  onChange={(v) => setValue("moneda", v)}
                  placeholder="Moneda"
                />
              </Field>
              <Field label="Fecha del gasto">
                <Input type="date" {...register("fecha_gasto")} />
              </Field>
            </div>

            {watch("moneda") === "MXN" && (
              <Field
                label="Tipo de cambio (MXN por USD)"
                hint="Sin TC, el gasto queda fuera del balance USD del reparto y bloquea el pre-cierre."
              >
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ej. 18.50"
                  {...register("tc_gasto")}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <SearchableSelect
                  options={CATEGORIAS}
                  value={watch("categoria")}
                  onChange={(v) => setValue("categoria", v)}
                  placeholder="Categoría"
                />
              </Field>
              <Field label="Comprobante">
                <SearchableSelect
                  options={ESTATUS}
                  value={watch("estatus_comprobante")}
                  onChange={(v) => setValue("estatus_comprobante", v)}
                  placeholder="Estatus"
                />
              </Field>
            </div>

            {!defaultVueloId && (
              <Field
                label="Vuelo"
                hint="Ligado al vuelo entra a su reporte y resta en el reparto; elige por folio, matrícula o ruta (±15 días de la fecha)."
              >
                <SearchableSelect
                  options={[
                    { value: "", label: "Sin vuelo" },
                    ...vuelos.map((v) => ({
                      value: v.id,
                      label:
                        `#${v.folio ?? "?"} · ${v.matricula ?? "sin avión"} · ${v.ruta ?? ""}` +
                        (v.fecha ? ` · ${fmtDateOnly(v.fecha)}` : ""),
                    })),
                  ]}
                  value={watch("vuelo_id")}
                  onChange={(v) => {
                    setValue("vuelo_id", v);
                    // El avión del vuelo elegido se refleja de inmediato.
                    const opt = vuelos.find((x) => x.id === v);
                    if (opt?.aeronave_id) setValue("aeronave_id", opt.aeronave_id);
                  }}
                  placeholder="Busca por folio, matrícula o ruta"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Medio de pago">
                <SearchableSelect
                  options={MEDIOS}
                  value={watch("medio_pago")}
                  onChange={(v) => setValue("medio_pago", v)}
                  placeholder="Medio"
                />
              </Field>
              <Field label="Avión">
                <SearchableSelect
                  options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
                  value={watch("aeronave_id")}
                  onChange={(v) => setValue("aeronave_id", v)}
                  placeholder="Sin asignar"
                />
              </Field>
            </div>

            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>

            <Field
              label="Factura / recibo (foto o PDF)"
              hint="Se guarda como comprobante del gasto; al adjuntar, el estatus pasa a Factura."
            >
              <Input
                ref={facturaRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFactura(file);
                  if (file && watch("estatus_comprobante") === "SIN_COMPROBANTE") {
                    setValue("estatus_comprobante", "FACTURA");
                  }
                }}
              />
            </Field>

            <Field label="Notas">
              <Textarea
                rows={2}
                placeholder="Ej. TUAS del vuelo a PTU del 28 de mayo"
                {...register("notas")}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar gasto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
