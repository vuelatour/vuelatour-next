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
import {
  createBankMovementAction,
  updateBankMovementAction,
} from "@/app/admin/treasury/actions";
import {
  BankMovementFormSchema,
  TIPO_MOVIMIENTO_BANCARIO_OPTIONS,
  type BankMovementFormValues,
} from "@/app/admin/treasury/schema";
import type { BankMovement } from "@/types/treasury";

export interface BankAccountOption {
  id: string;
  alias: string;
  banco: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMovement?: BankMovement;
  bankAccounts: BankAccountOption[];
}

export function BankMovementFormDialog({
  open,
  onOpenChange,
  initialMovement,
  bankAccounts,
}: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialMovement;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BankMovementFormValues>({
    resolver: zodResolver(BankMovementFormSchema),
    defaultValues: defaults(initialMovement),
  });

  useEffect(() => {
    if (open) reset(defaults(initialMovement));
  }, [open, initialMovement, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateBankMovementAction(initialMovement!.id, values)
        : await createBankMovementAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Movimiento actualizado" : "Movimiento registrado");
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
          <DialogTitle>
            {isEdit ? "Editar movimiento" : "Nuevo movimiento bancario"}
          </DialogTitle>
          <DialogDescription>
            Línea de estado de cuenta. La importación masiva desde Excel/CSV llegará
            con el microservicio Python.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Cuenta bancaria" required error={errors.cuenta_bancaria_id?.message}>
            <SearchableSelect
              options={bankAccounts.map((b) => ({
                value: b.id,
                label: b.alias,
                description: b.banco,
              }))}
              value={watch("cuenta_bancaria_id")}
              onChange={(v) => setValue("cuenta_bancaria_id", v)}
              placeholder="Selecciona cuenta"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register("fecha")} />
            </Field>
            <Field label="Tipo" required error={errors.tipo?.message}>
              <SearchableSelect
                options={TIPO_MOVIMIENTO_BANCARIO_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={watch("tipo")}
                onChange={(v) => setValue("tipo", v as BankMovementFormValues["tipo"])}
              />
            </Field>
            <Field label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" min={0} {...register("monto")} />
            </Field>
          </div>

          <Field label="Descripción" error={errors.descripcion?.message}>
            <Input placeholder="Texto del estado de cuenta" {...register("descripcion")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Referencia" error={errors.referencia?.message}>
              <Input placeholder="Folio bancario" {...register("referencia")} />
            </Field>
            <Field
              label="Saldo posterior"
              hint="Saldo de la cuenta tras el movimiento"
              error={errors.saldo_posterior?.message}
            >
              <Input type="number" step="0.01" placeholder="Opcional" {...register("saldo_posterior")} />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar"}
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

function defaults(m?: BankMovement): BankMovementFormValues {
  if (!m) {
    return {
      cuenta_bancaria_id: "",
      fecha: new Date().toISOString().slice(0, 10),
      tipo: "CARGO",
      monto: "" as unknown as number,
      descripcion: "",
      referencia: "",
      saldo_posterior: "",
      notas: "",
    };
  }
  return {
    cuenta_bancaria_id: m.cuenta_bancaria_id,
    fecha: m.fecha,
    tipo: m.tipo,
    monto: Number(m.monto),
    descripcion: m.descripcion ?? "",
    referencia: m.referencia ?? "",
    saldo_posterior: m.saldo_posterior ? Number(m.saldo_posterior) : "",
    notas: m.notas ?? "",
  };
}
