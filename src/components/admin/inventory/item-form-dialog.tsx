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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createItemAction, updateItemAction } from "@/app/admin/inventory/actions";
import type { ItemFormValues } from "@/app/admin/inventory/schema";
import type { InventarioItem } from "@/types/inventory";

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: InventarioItem;
}

export function ItemFormDialog({ open, onOpenChange, initialItem }: ItemFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialItem;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ItemFormValues>({ defaultValues: defaults(initialItem) });

  useEffect(() => {
    if (open) reset(defaults(initialItem));
  }, [open, initialItem, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateItemAction(initialItem!.id, values)
        : await createItemAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Ítem actualizado" : "Ítem creado");
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
          <DialogTitle>{isEdit ? "Editar ítem" : "Nuevo ítem de inventario"}</DialogTitle>
          <DialogDescription>
            Catálogo de bodega. El stock se calcula del cardex (entradas menos salidas, FIFO); no
            se edita aquí.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Filtro de aceite 108-1" {...register("nombre", { required: "Requerido" })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría" required hint="Libre: aceites, filtros…" error={errors.categoria?.message}>
              <Input placeholder="filtros" {...register("categoria", { required: "Requerido" })} />
            </Field>
            <Field label="Número de parte" hint="P/N del fabricante" error={errors.numero_parte?.message}>
              <Input placeholder="108-1" {...register("numero_parte")} className="font-mono" />
            </Field>
          </div>

          <Field label="Código (SKU / código de barras)" hint="Código interno de bodega" error={errors.codigo?.message}>
            <Input placeholder="SKU-00123" {...register("codigo")} className="font-mono" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock mínimo" hint="Alerta por email al bajar" error={errors.stock_minimo?.message}>
              <Input type="number" step="any" min="0" placeholder="0" {...register("stock_minimo")} />
            </Field>
            <Field label="Ubicación" error={errors.ubicacion?.message}>
              <Input placeholder="Bodega Cancún" {...register("ubicacion")} />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ítem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {(hint || error) && (
        <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function defaults(item?: InventarioItem): ItemFormValues {
  if (!item) {
    return { nombre: "", numero_parte: "", codigo: "", categoria: "", stock_minimo: "", ubicacion: "", notas: "" };
  }
  return {
    nombre: item.nombre,
    numero_parte: item.numero_parte ?? "",
    codigo: item.codigo ?? "",
    categoria: item.categoria,
    stock_minimo: item.stock_minimo != null ? String(item.stock_minimo) : "",
    ubicacion: item.ubicacion ?? "",
    notas: item.notas ?? "",
  };
}
