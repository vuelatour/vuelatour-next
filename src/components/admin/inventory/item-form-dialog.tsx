"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { uploadInventarioFoto } from "@/lib/storage/inventario-fotos";

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: InventarioItem;
}

export function ItemFormDialog({ open, onOpenChange, initialItem }: ItemFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialItem;
  // Foto del producto: archivo nuevo elegido, o quitar la existente.
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ItemFormValues>({ defaultValues: defaults(initialItem) });

  useEffect(() => {
    if (open) {
      reset(defaults(initialItem));
      setFotoFile(null);
      setFotoPreview(null);
      setQuitarFoto(false);
    }
  }, [open, initialItem, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // La foto primero: si la subida falla, no se guarda el ítem a medias.
      let fotoPayload: { foto_url: string | null; foto_storage_path: string | null } | undefined;
      if (fotoFile) {
        try {
          const subida = await uploadInventarioFoto(fotoFile);
          fotoPayload = { foto_url: subida.url, foto_storage_path: subida.storage_path };
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo subir la foto");
          return;
        }
      } else if (quitarFoto && isEdit) {
        fotoPayload = { foto_url: null, foto_storage_path: null };
      }
      const payload = fotoPayload ? { ...values, ...fotoPayload } : values;
      const result = isEdit
        ? await updateItemAction(initialItem!.id, payload)
        : await createItemAction(payload);

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
          {/* Foto del producto: se ve en la app del mecánico y en el listado. */}
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            {fotoPreview || (initialItem?.foto_url && !quitarFoto) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoPreview ?? initialItem?.foto_url ?? ""}
                alt="Foto del producto"
                className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground text-[10px] text-center">
                Sin foto
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Foto del producto</p>
              <p className="text-xs text-muted-foreground">
                JPG/PNG/WebP · se muestra en la app y el listado.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fotoRef.current?.click()}
                >
                  {fotoPreview || initialItem?.foto_url ? "Cambiar" : "Subir foto"}
                </Button>
                {(fotoPreview || (initialItem?.foto_url && !quitarFoto)) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFotoFile(null);
                      setFotoPreview(null);
                      setQuitarFoto(true);
                      if (fotoRef.current) fotoRef.current.value = "";
                    }}
                  >
                    Quitar
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={fotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFotoFile(file);
                setQuitarFoto(false);
                setFotoPreview((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return file ? URL.createObjectURL(file) : null;
                });
              }}
            />
          </div>

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

          {/* Presentación del stock: en qué se cuenta (el cardex y las alertas
              hablan en esta unidad). Texto libre con sugerencias comunes. */}
          <Field label="Unidad" hint="En qué se cuenta el stock" error={errors.unidad?.message}>
            <>
              <Input
                placeholder="pieza, caja, bote, galón, litro, bolsa…"
                list="unidades-sugeridas"
                {...register("unidad")}
              />
              <datalist id="unidades-sugeridas">
                <option value="pieza" />
                <option value="caja" />
                <option value="bote" />
                <option value="galón" />
                <option value="litro" />
                <option value="bolsa" />
                <option value="juego" />
                <option value="metro" />
              </datalist>
            </>
          </Field>

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
      unidad: "",
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
    unidad: item.unidad ?? "",
    notas: item.notas ?? "",
    cantidad_inicial: "",
    costo_inicial_usd: "",
    moneda_inicial: "MXN",
    tc_inicial: "",
  };
}
