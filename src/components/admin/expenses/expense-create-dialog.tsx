"use client";

import { useState, useTransition } from "react";
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
import { createGastoAction } from "@/app/admin/expenses/actions";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import { Field } from "@/components/admin/form-field";

const CATEGORIAS = [
  "GAS",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "FIJO",
  "OTRO",
].map((c) => ({ value: c, label: c }));

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

function emptyValues(): GastoCreateValues {
  return {
    categoria: "OPERACIONES",
    monto: "",
    moneda: "MXN",
    fecha_gasto: hoyCancun(),
    medio_pago: "TRANSFERENCIA",
    estatus_comprobante: "SIN_COMPROBANTE",
    aeronave_id: "",
    proveedor_id: "",
    notas: "",
  };
}

/** Alta manual de gasto operativo desde el panel (lo sube administración). */
export function ExpenseCreateDialog({
  aircraft,
  providers,
}: {
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoCreateValues>({
    defaultValues: emptyValues(),
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createGastoAction(values);
      if (result.ok) {
        toast.success("Gasto registrado");
        reset(emptyValues());
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
        Nuevo gasto
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo gasto (oficina)</DialogTitle>
            <DialogDescription>
              Captura manual de un gasto operativo. Queda marcado como subido por
              administración; si la factura llega después, se amarra en Facturas recibidas.
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
