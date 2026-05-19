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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createMovementAction } from "@/app/admin/inventory/actions";
import {
  InventoryMovementFormSchema,
  TIPO_MOVIMIENTO_OPTIONS,
  type InventoryMovementFormValues,
} from "@/app/admin/inventory/schema";
import type { InventoryItem } from "@/types/inventory";

export interface AircraftOption {
  id: string;
  matricula: string;
}
export interface ProviderOption {
  id: string;
  nombre: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem;
  aircraft: AircraftOption[];
  providers: ProviderOption[];
}

export function MovementFormDialog({
  open,
  onOpenChange,
  item,
  aircraft,
  providers,
}: Props) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InventoryMovementFormValues>({
    resolver: zodResolver(InventoryMovementFormSchema),
    defaultValues: defaults(item.id),
  });

  useEffect(() => {
    if (open) reset(defaults(item.id));
  }, [open, item.id, reset]);

  const tipo = watch("tipo");
  const esEntrada = tipo === "ENTRADA";
  const esDevolucion = tipo === "DEVOLUCION";
  const esSalida = tipo === "SALIDA";
  const pideCosto = esEntrada || esDevolucion;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createMovementAction(values);
      if (result.ok) {
        toast.success("Movimiento registrado");
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
          <DialogTitle>Movimiento — {item.nombre}</DialogTitle>
          <DialogDescription>
            Stock actual: {item.stock_actual}. En salidas y ajustes el costo se calcula
            por FIFO automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Tipo de movimiento" required error={errors.tipo?.message}>
            <SearchableSelect
              options={TIPO_MOVIMIENTO_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={tipo}
              onChange={(v) =>
                setValue("tipo", v as InventoryMovementFormValues["tipo"])
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" required error={errors.cantidad?.message}>
              <Input type="number" step="0.01" min={0} {...register("cantidad")} />
            </Field>
            {pideCosto && (
              <Field
                label="Costo unitario USD"
                required
                error={errors.costo_unitario_usd?.message}
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  {...register("costo_unitario_usd")}
                />
              </Field>
            )}
          </div>

          {esEntrada && (
            <Field label="Proveedor" error={errors.proveedor_id?.message}>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin proveedor" },
                  ...providers.map((p) => ({ value: p.id, label: p.nombre })),
                ]}
                value={watch("proveedor_id") ?? ""}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>
          )}

          {(esSalida || esDevolucion) && (
            <Field
              label="Aeronave"
              required={esSalida}
              hint={esSalida ? "Obligatorio: a qué avión se carga" : "Opcional"}
              error={errors.aeronave_id?.message}
            >
              <SearchableSelect
                options={[
                  { value: "", label: "Sin aeronave" },
                  ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
                ]}
                value={watch("aeronave_id") ?? ""}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Selecciona aeronave"
              />
            </Field>
          )}

          <Field label="Fecha del movimiento" error={errors.fecha_movimiento?.message}>
            <Input type="date" {...register("fecha_movimiento")} />
          </Field>

          {esEntrada && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de la orden" error={errors.fecha_orden?.message}>
                <Input type="date" {...register("fecha_orden")} />
              </Field>
              <Field label="Fecha cargo banco" error={errors.fecha_cargo_banco?.message}>
                <Input type="date" {...register("fecha_cargo_banco")} />
              </Field>
            </div>
          )}

          <Field label="Referencia" hint="N° de orden / folio" error={errors.referencia?.message}>
            <Input placeholder="Opcional" {...register("referencia")} />
          </Field>

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
              {pending ? "Registrando…" : "Registrar movimiento"}
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

function defaults(itemId: string): InventoryMovementFormValues {
  return {
    item_id: itemId,
    tipo: "ENTRADA",
    cantidad: "" as unknown as number,
    costo_unitario_usd: "",
    aeronave_id: "",
    proveedor_id: "",
    fecha_movimiento: new Date().toISOString().slice(0, 10),
    fecha_orden: "",
    fecha_cargo_banco: "",
    referencia: "",
    notas: "",
  };
}
