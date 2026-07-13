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
import {
  createItemAction,
  createMovimientoAction,
  updateItemAction,
} from "@/app/admin/inventory/actions";
import type { ItemFormValues } from "@/app/admin/inventory/schema";
import type { InventarioItem } from "@/types/inventory";
import { Field } from "@/components/admin/form-field";

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
    watch,
    setValue,
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
        // Entrada inicial opcional al crear: registra la compra (cantidad +
        // costo) como ENTRADA de cardex para que el ítem no quede en 0 sin
        // precio. Best-effort: si falla, el ítem ya existe y se avisa.
        const cant = values.cantidad_inicial?.trim();
        const costo = values.costo_inicial_usd?.trim();
        if (!isEdit && result.data && cant && costo) {
          const esMxn = values.moneda_inicial === "MXN";
          const mov = await createMovimientoAction(result.data.id, {
            tipo: "ENTRADA",
            cantidad: cant,
            moneda: values.moneda_inicial,
            ...(esMxn
              ? { costo_unitario_mxn: costo, tc_usd_mxn: values.tc_inicial }
              : { costo_unitario_usd: costo }),
            notas: "Stock inicial (alta del ítem)",
          });
          if (!mov.ok) {
            toast.warning(
              `Ítem creado, pero la entrada inicial falló: ${mov.error ?? "regístrala desde el detalle"}`,
            );
            onOpenChange(false);
            return;
          }
        }
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

          {!isEdit && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Entrada inicial (opcional):</span>{" "}
                si ya tienes la pieza comprada, captura cuántas y su costo para que el ítem no
                quede en stock 0. Queda registrada como compra en el cardex.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cantidad inicial">
                  <Input type="number" step="any" min="0" placeholder="0" {...register("cantidad_inicial")} />
                </Field>
                <Field label="Costo unitario">
                  <div className="flex gap-2">
                    <select
                      value={watch("moneda_inicial")}
                      onChange={(e) =>
                        setValue("moneda_inicial", e.target.value as ItemFormValues["moneda_inicial"])
                      }
                      className="h-9 w-20 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </select>
                    <Input type="number" step="any" min="0" placeholder="0.00" {...register("costo_inicial_usd")} />
                  </div>
                </Field>
              </div>
              {watch("moneda_inicial") === "MXN" && (
                <Field
                  label="Tipo de cambio (MXN por USD)"
                  hint="El de la compra. El costo se convierte a USD para el balance."
                >
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="Ej. 18.50"
                      className="w-32"
                      {...register("tc_inicial")}
                    />
                    {Number(watch("costo_inicial_usd")) > 0 && Number(watch("tc_inicial")) > 0 && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ≈ ${(Number(watch("costo_inicial_usd")) / Number(watch("tc_inicial"))).toFixed(2)} USD c/u
                      </span>
                    )}
                  </div>
                </Field>
              )}
            </div>
          )}

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


function defaults(item?: InventarioItem): ItemFormValues {
  if (!item) {
    return {
      nombre: "",
      numero_parte: "",
      codigo: "",
      categoria: "",
      stock_minimo: "",
      ubicacion: "",
      notas: "",
      cantidad_inicial: "",
      costo_inicial_usd: "",
      moneda_inicial: "MXN",
      tc_inicial: "",
    };
  }
  return {
    nombre: item.nombre,
    numero_parte: item.numero_parte ?? "",
    codigo: item.codigo ?? "",
    categoria: item.categoria,
    stock_minimo: item.stock_minimo != null ? String(item.stock_minimo) : "",
    ubicacion: item.ubicacion ?? "",
    notas: item.notas ?? "",
    cantidad_inicial: "",
    costo_inicial_usd: "",
    moneda_inicial: "MXN",
    tc_inicial: "",
  };
}
