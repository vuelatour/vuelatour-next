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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createMovimientoAction } from "@/app/admin/inventory/actions";
import type { MovimientoFormValues } from "@/app/admin/inventory/schema";
import { Field } from "@/components/admin/form-field";

const TIPOS = [
  { value: "ENTRADA", label: "Entrada (compra / alta de stock)" },
  { value: "SALIDA", label: "Salida (consumo, se carga a un avión)" },
  { value: "DEVOLUCION", label: "Devolución (regresa a bodega)" },
  { value: "AJUSTE", label: "Ajuste / merma (corrección o desecho)" },
];

interface MovimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemNombre: string;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}

export function MovimientoDialog({
  open,
  onOpenChange,
  itemId,
  itemNombre,
  aircraft,
  providers,
}: MovimientoDialogProps) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MovimientoFormValues>({ defaultValues: defaults() });

  useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset]);

  const tipo = watch("tipo");
  const esSalida = tipo === "SALIDA";

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createMovimientoAction(itemId, values);
      if (result.ok) {
        toast.success("Movimiento registrado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimiento de cardex</DialogTitle>
          <DialogDescription>{itemNombre}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Tipo" required>
            <SearchableSelect
              options={TIPOS}
              value={tipo}
              onChange={(v) => setValue("tipo", v as MovimientoFormValues["tipo"])}
              placeholder="Tipo de movimiento"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" required error={errors.cantidad?.message}>
              <Input type="number" step="any" min="0" {...register("cantidad", { required: "Requerido" })} />
            </Field>
            {esSalida ? (
              <Field label="Costo unitario" hint="Se calcula por FIFO">
                <Input value="FIFO automático" disabled readOnly className="text-muted-foreground" />
              </Field>
            ) : (
              <Field label="Costo unitario (USD)" required error={errors.costo_unitario_usd?.message}>
                <Input type="number" step="any" min="0" {...register("costo_unitario_usd")} />
              </Field>
            )}
          </div>

          {esSalida && (
            <Field label="Avión (se le carga la pieza)" required error={errors.aeronave_id?.message}>
              <SearchableSelect
                options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
                value={watch("aeronave_id")}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Matrícula"
              />
            </Field>
          )}

          {tipo === "ENTRADA" && (
            <Field label="Proveedor" error={errors.proveedor_id?.message}>
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="De dónde vino"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" error={errors.fecha_movimiento?.message}>
              <Input type="date" {...register("fecha_movimiento")} />
            </Field>
            <Field label="Referencia" hint="No. orden / factura">
              <Input {...register("referencia")} />
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
              {pending ? "Registrando…" : "Registrar movimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(): MovimientoFormValues {
  return {
    tipo: "ENTRADA",
    cantidad: "",
    costo_unitario_usd: "",
    aeronave_id: "",
    proveedor_id: "",
    fecha_movimiento: "",
    referencia: "",
    notas: "",
  };
}
