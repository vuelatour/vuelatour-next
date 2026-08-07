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
import { createFondoAction } from "@/app/admin/caja-chica/actions";
import type { FondoFormValues } from "@/app/admin/caja-chica/schema";
import { Field } from "@/components/admin/form-field";

const MONEDAS = [
  { value: "MXN", label: "Pesos (MXN)" },
  { value: "USD", label: "Dólares (USD)" },
];

interface FondoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarios: { id: string; nombre: string; rol: string }[];
}

export function FondoFormDialog({ open, onOpenChange, usuarios }: FondoFormDialogProps) {
  const [pending, startTransition] = useTransition();

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    register,
    formState: { errors },
  } = useForm<FondoFormValues>({
    defaultValues: { usuario_id: "", moneda: "MXN", es_acumulada: false, notas: "" },
  });

  useEffect(() => {
    if (open) reset({ usuario_id: "", moneda: "MXN", es_acumulada: false, notas: "" });
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createFondoAction(values);
      if (result.ok) {
        toast.success("Fondo abierto");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir fondo de caja chica</DialogTitle>
          <DialogDescription>
            Cada persona tiene un solo fondo. El saldo se calcula de las reposiciones menos los
            gastos en efectivo que capture.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Persona" required error={errors.usuario_id?.message}>
            <SearchableSelect
              options={usuarios.map((u) => ({ value: u.id, label: u.nombre, description: u.rol }))}
              value={watch("usuario_id")}
              onChange={(v) => setValue("usuario_id", v)}
              placeholder="Selecciona persona"
              emptyText="Todas las personas ya tienen fondo"
            />
          </Field>

          <Field label="Moneda" required>
            <SearchableSelect
              options={MONEDAS}
              value={watch("moneda")}
              onChange={(v) => setValue("moneda", v as FondoFormValues["moneda"])}
              placeholder="Moneda"
            />
          </Field>

          {/* Caja "al revés" (pedido 6 ago 2026): para admins/pilotos que
              gastan de su bolsa — el número mostrado es lo POR REPONER. */}
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={watch("es_acumulada") ?? false}
              onChange={(e) => setValue("es_acumulada", e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">Caja acumulada (al revés)</span>
              <span className="block text-xs text-muted-foreground">
                No se le entrega fondo: gasta de su bolsa. El número sube con cada gasto en
                efectivo y una REPOSICIÓN por ese monto lo regresa a cero.
              </span>
            </span>
          </label>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Abriendo…" : "Abrir fondo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

