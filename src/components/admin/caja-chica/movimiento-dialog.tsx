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
import { createCajaMovimientoAction } from "@/app/admin/caja-chica/actions";
import type { MovimientoFormValues } from "@/app/admin/caja-chica/schema";
import type { MonedaCaja } from "@/types/caja-chica";
import { Field } from "@/components/admin/form-field";

const TIPOS = [
  { value: "REPOSICION", label: "Reposición (entra dinero al fondo)" },
  { value: "REINTEGRO", label: "Reintegro a dirección (sale efectivo)" },
  { value: "AJUSTE", label: "Ajuste (corrección, puede ser negativo)" },
];

interface MovimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fondoId: string;
  persona: string;
  moneda: MonedaCaja;
  usuarios: { id: string; nombre: string }[];
}

export function MovimientoDialog({
  open,
  onOpenChange,
  fondoId,
  persona,
  moneda,
  usuarios,
}: MovimientoDialogProps) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MovimientoFormValues>({ defaultValues: defaults(moneda) });

  useEffect(() => {
    if (open) reset(defaults(moneda));
  }, [open, moneda, reset]);

  const tipo = watch("tipo");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createCajaMovimientoAction(fondoId, values);
      if (result.ok) {
        toast.success("Movimiento registrado");
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimiento de caja chica</DialogTitle>
          <DialogDescription>{persona}</DialogDescription>
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
            <Field label={`Monto (${moneda})`} required error={errors.monto?.message}>
              <Input
                type="number"
                step="any"
                {...register("monto", { required: "Requerido" })}
              />
            </Field>
            <Field label="Fecha">
              <Input type="date" {...register("fecha")} />
            </Field>
          </div>

          {tipo === "REPOSICION" && (
            <Field label="Autorizado por">
              <SearchableSelect
                options={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
                value={watch("autorizado_por")}
                onChange={(v) => setValue("autorizado_por", v)}
                placeholder="Quién autoriza (ej. Ale)"
              />
            </Field>
          )}

          <Field label="Referencia" hint="No. de depósito / comprobante">
            <Input {...register("referencia")} />
          </Field>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(moneda: MonedaCaja): MovimientoFormValues {
  return {
    tipo: "REPOSICION",
    monto: "",
    moneda,
    fecha: "",
    autorizado_por: "",
    referencia: "",
    notas: "",
  };
}
