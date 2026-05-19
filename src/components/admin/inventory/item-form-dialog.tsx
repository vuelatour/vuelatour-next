"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  InventoryItemFormSchema,
  type InventoryItemFormValues,
} from "@/app/admin/inventory/schema";
import type { InventoryItem } from "@/types/inventory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: InventoryItem;
}

export function ItemFormDialog({ open, onOpenChange, initialItem }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialItem;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InventoryItemFormValues>({
    resolver: zodResolver(InventoryItemFormSchema),
    defaultValues: defaults(initialItem),
  });

  useEffect(() => {
    if (open) reset(defaults(initialItem));
  }, [open, initialItem, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateItemAction(initialItem!.id, values)
        : await createItemAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Insumo actualizado" : "Insumo creado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar ${initialItem!.nombre}` : "Nuevo insumo"}</DialogTitle>
          <DialogDescription>
            Catálogo de bodega. El stock no se edita aquí: cambia con los movimientos
            (entradas y salidas).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Filtro de aceite 108-1" {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Número de parte" error={errors.numero_parte?.message}>
              <Input placeholder="Opcional" className="font-mono" {...register("numero_parte")} />
            </Field>
            <Field label="Categoría" required error={errors.categoria?.message}>
              <Input placeholder="Filtros" {...register("categoria")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Stock mínimo"
              hint="Umbral de alerta. Vacío = sin alerta"
              error={errors.stock_minimo?.message}
            >
              <Input type="number" step="0.01" min={0} placeholder="—" {...register("stock_minimo")} />
            </Field>
            <Field label="Ubicación" error={errors.ubicacion?.message}>
              <Input {...register("ubicacion")} />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear insumo"}
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

function defaults(item?: InventoryItem): InventoryItemFormValues {
  if (!item) {
    return {
      nombre: "",
      numero_parte: "",
      categoria: "",
      stock_minimo: "",
      ubicacion: "Bodega Cancun",
      notas: "",
    };
  }
  return {
    nombre: item.nombre,
    numero_parte: item.numero_parte ?? "",
    categoria: item.categoria,
    stock_minimo: item.stock_minimo ? Number(item.stock_minimo) : "",
    ubicacion: item.ubicacion,
    notas: item.notas ?? "",
  };
}
