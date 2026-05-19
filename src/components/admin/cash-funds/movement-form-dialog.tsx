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
import { createMovementAction } from "@/app/admin/cash-funds/actions";
import {
  FundMovementFormSchema,
  TIPO_MOVIMIENTO_FONDO_OPTIONS,
  type FundMovementFormValues,
} from "@/app/admin/cash-funds/schema";
import type { CashFund } from "@/types/cash-funds";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fund: CashFund;
}

export function MovementFormDialog({ open, onOpenChange, fund }: Props) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FundMovementFormValues>({
    resolver: zodResolver(FundMovementFormSchema),
    defaultValues: defaults(fund),
  });

  useEffect(() => {
    if (open) reset(defaults(fund));
  }, [open, fund, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createMovementAction(values);
      if (result.ok) {
        toast.success("Solicitud registrada (pendiente de autorizar)");
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar movimiento</DialogTitle>
          <DialogDescription>
            Reposición o reintegro del fondo. Queda en estado SOLICITADO hasta que un
            director lo autorice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Tipo de movimiento" required error={errors.tipo?.message}>
            <SearchableSelect
              options={TIPO_MOVIMIENTO_FONDO_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={watch("tipo")}
              onChange={(v) => setValue("tipo", v as FundMovementFormValues["tipo"])}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" min={0} {...register("monto")} />
            </Field>
            <Field label="Fecha" error={errors.fecha?.message}>
              <Input type="date" {...register("fecha")} />
            </Field>
          </div>

          <Field label="Referencia" hint="Folio / comprobante" error={errors.referencia?.message}>
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
              {pending ? "Registrando…" : "Solicitar"}
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

function defaults(fund: CashFund): FundMovementFormValues {
  return {
    fondo_id: fund.id,
    tipo: fund.tipo === "FIJO" ? "REPOSICION" : "REINTEGRO",
    monto: "" as unknown as number,
    fecha: new Date().toISOString().slice(0, 10),
    referencia: "",
    notas: "",
  };
}
