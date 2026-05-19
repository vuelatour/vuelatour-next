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
import { createFundAction, updateFundAction } from "@/app/admin/cash-funds/actions";
import {
  CashFundFormSchema,
  MEDIO_PAGO_FONDO_OPTIONS,
  TIPO_FONDO_OPTIONS,
  type CashFundFormValues,
} from "@/app/admin/cash-funds/schema";
import type { CashFund } from "@/types/cash-funds";

export interface UserOption {
  id: string;
  nombre: string;
  email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFund?: CashFund;
  users: UserOption[];
}

export function FundFormDialog({ open, onOpenChange, initialFund, users }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialFund;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CashFundFormValues>({
    resolver: zodResolver(CashFundFormSchema),
    defaultValues: defaults(initialFund),
  });

  useEffect(() => {
    if (open) reset(defaults(initialFund));
  }, [open, initialFund, reset]);

  const tipo = watch("tipo");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateFundAction(initialFund!.id, values)
        : await createFundAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Fondo actualizado" : "Fondo creado");
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
          <DialogTitle>{isEdit ? "Editar fondo" : "Nuevo fondo de caja chica"}</DialogTitle>
          <DialogDescription>
            Un fondo FIJO lo administra Mary y se repone. Un fondo REINTEGRO registra
            gastos personales que la empresa devuelve.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Persona" required error={errors.usuario_id?.message}>
            <SearchableSelect
              options={users.map((u) => ({
                value: u.id,
                label: u.nombre,
                description: u.email,
              }))}
              value={watch("usuario_id")}
              onChange={(v) => setValue("usuario_id", v)}
              placeholder="Selecciona persona"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de fondo" required error={errors.tipo?.message}>
              <SearchableSelect
                options={TIPO_FONDO_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={tipo}
                onChange={(v) => setValue("tipo", v as CashFundFormValues["tipo"])}
              />
            </Field>
            <Field
              label="Medio de pago asociado"
              hint="Gastos con este medio consumen el fondo"
              required
              error={errors.medio_pago_asociado?.message}
            >
              <SearchableSelect
                options={MEDIO_PAGO_FONDO_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={watch("medio_pago_asociado")}
                onChange={(v) =>
                  setValue(
                    "medio_pago_asociado",
                    v as CashFundFormValues["medio_pago_asociado"],
                  )
                }
                placeholder="Selecciona medio"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Monto asignado"
              hint={tipo === "FIJO" ? "Monto objetivo del fondo" : "Sin uso en reintegro"}
              error={errors.monto_asignado?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                disabled={tipo === "REINTEGRO"}
                {...register("monto_asignado")}
              />
            </Field>
            <Field label="Moneda" error={errors.moneda?.message}>
              <SearchableSelect
                options={[
                  { value: "MXN", label: "MXN — Pesos" },
                  { value: "USD", label: "USD — Dólares" },
                ]}
                value={watch("moneda")}
                onChange={(v) => setValue("moneda", v as CashFundFormValues["moneda"])}
              />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear fondo"}
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

function defaults(fund?: CashFund): CashFundFormValues {
  if (!fund) {
    return {
      usuario_id: "",
      tipo: "FIJO",
      medio_pago_asociado: "EFECTIVO",
      monto_asignado: 0,
      moneda: "MXN",
      notas: "",
    };
  }
  return {
    usuario_id: fund.usuario_id,
    tipo: fund.tipo,
    medio_pago_asociado: fund.medio_pago_asociado,
    monto_asignado: Number(fund.monto_asignado),
    moneda: fund.moneda === "USD" ? "USD" : "MXN",
    notas: fund.notas ?? "",
  };
}
