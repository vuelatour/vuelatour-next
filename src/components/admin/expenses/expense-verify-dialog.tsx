"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { verifyGastoAction } from "@/app/admin/expenses/actions";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import type { Gasto } from "@/types/expenses";
import { Field } from "@/components/admin/form-field";

const CATEGORIAS = [
  "GAS",
  "ATERRIZAJE",
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
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const ESTATUS = [
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
  { value: "SIN_COMPROBANTE", label: "Sin comprobante" },
];

interface ExpenseVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}

export function ExpenseVerifyDialog({
  open,
  onOpenChange,
  gasto,
  aircraft,
  providers,
}: ExpenseVerifyDialogProps) {
  const [pending, startTransition] = useTransition();

  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoVerifyValues>({
    defaultValues: defaults(gasto),
  });

  useEffect(() => {
    if (open) reset(defaults(gasto));
  }, [open, gasto, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await verifyGastoAction(gasto.id, values);
      if (result.ok) {
        toast.success("Gasto verificado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  const monto = Number(gasto.monto).toLocaleString("es-MX", {
    style: "currency",
    currency: gasto.moneda,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar gasto · {monto}</DialogTitle>
          <DialogDescription>
            Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la
            bandeja de pendientes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Avión (resuelve pendiente)">
            <SearchableSelect
              options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
              value={watch("aeronave_id")}
              onChange={(v) => setValue("aeronave_id", v)}
              placeholder="Sin asignar"
            />
          </Field>

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
            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(g: Gasto): GastoVerifyValues {
  return {
    categoria: g.categoria,
    medio_pago: g.medio_pago,
    estatus_comprobante: g.estatus_comprobante,
    aeronave_id: g.aeronave_id ?? "",
    proveedor_id: g.proveedor_id ?? "",
    notas: g.notas ?? "",
  };
}
