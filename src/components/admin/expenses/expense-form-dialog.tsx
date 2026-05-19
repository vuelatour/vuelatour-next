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
import { createExpenseAction, updateExpenseAction } from "@/app/admin/expenses/actions";
import {
  CATEGORIA_OPTIONS,
  ESTATUS_COMPROBANTE_OPTIONS,
  GastoFormSchema,
  MEDIO_PAGO_OPTIONS,
  MONEDA_OPTIONS,
  type GastoFormValues,
} from "@/app/admin/expenses/schema";
import type { Expense } from "@/types/expenses";

export interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}
export interface ProviderOption {
  id: string;
  nombre: string;
}
export interface FlightOption {
  id: string;
  folio: number;
  origen_iata: string;
  destino_iata: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExpense?: Expense;
  aircraft: AircraftOption[];
  providers: ProviderOption[];
  flights: FlightOption[];
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  initialExpense,
  aircraft,
  providers,
  flights,
}: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialExpense;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GastoFormValues>({
    resolver: zodResolver(GastoFormSchema),
    defaultValues: defaults(initialExpense),
  });

  useEffect(() => {
    if (open) reset(defaults(initialExpense));
  }, [open, initialExpense, reset]);

  const medioPago = watch("medio_pago");
  const esTarjeta = medioPago === "TARJETA_CORP";

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateExpenseAction(initialExpense!.id, values)
        : await createExpenseAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Gasto actualizado" : "Gasto registrado");
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            Captura un gasto operativo. Sin aeronave queda en la bandeja de pendientes
            hasta asignarlo. Sin factura, márcalo como Vale.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría" required error={errors.categoria?.message}>
              <SearchableSelect
                options={CATEGORIA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={watch("categoria")}
                onChange={(v) => setValue("categoria", v as GastoFormValues["categoria"])}
                placeholder="Selecciona categoría"
              />
            </Field>
            <Field label="Fecha del gasto" required error={errors.fecha_gasto?.message}>
              <Input type="date" {...register("fecha_gasto")} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" min={0} placeholder="0.00" {...register("monto")} />
            </Field>
            <Field label="Moneda" required error={errors.moneda?.message}>
              <SearchableSelect
                options={MONEDA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={watch("moneda")}
                onChange={(v) => setValue("moneda", v as GastoFormValues["moneda"])}
              />
            </Field>
            <Field
              label="TC del día"
              hint="DOF, opcional"
              error={errors.tc_gasto?.message}
            >
              <Input
                type="number"
                step="0.0001"
                min={0}
                placeholder="Opcional"
                {...register("tc_gasto")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Medio de pago" required error={errors.medio_pago?.message}>
              <SearchableSelect
                options={MEDIO_PAGO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={watch("medio_pago")}
                onChange={(v) => setValue("medio_pago", v as GastoFormValues["medio_pago"])}
                placeholder="Selecciona medio"
              />
            </Field>
            <Field
              label="Terminación de tarjeta"
              hint={esTarjeta ? "Últimos 4 dígitos" : "Solo aplica con tarjeta corporativa"}
              error={errors.tarjeta_terminacion?.message}
            >
              <Input
                maxLength={4}
                placeholder="6256"
                className="font-mono"
                disabled={!esTarjeta}
                {...register("tarjeta_terminacion")}
              />
            </Field>
          </div>

          <Field label="Estatus de comprobante" required error={errors.estatus_comprobante?.message}>
            <SearchableSelect
              options={ESTATUS_COMPROBANTE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={watch("estatus_comprobante")}
              onChange={(v) =>
                setValue("estatus_comprobante", v as GastoFormValues["estatus_comprobante"])
              }
            />
          </Field>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-semibold">Asignación (opcional)</p>
            <Field
              label="Aeronave"
              hint="Déjalo vacío para mandarlo a la bandeja de pendientes"
              error={errors.aeronave_id?.message}
            >
              <SearchableSelect
                options={[
                  { value: "", label: "Pendiente (sin asignar)" },
                  ...aircraft.map((a) => ({
                    value: a.id,
                    label: a.matricula,
                    description: a.modelo,
                  })),
                ]}
                value={watch("aeronave_id") ?? ""}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Pendiente (sin asignar)"
              />
            </Field>
            <Field label="Vuelo" hint="Vuelo asociado, si aplica" error={errors.vuelo_id?.message}>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin vuelo" },
                  ...flights.map((f) => ({
                    value: f.id,
                    label: `#${f.folio}`,
                    description: `${f.origen_iata} → ${f.destino_iata}`,
                  })),
                ]}
                value={watch("vuelo_id") ?? ""}
                onChange={(v) => setValue("vuelo_id", v)}
                placeholder="Sin vuelo"
              />
            </Field>
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
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar gasto"}
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

function defaults(expense?: Expense): GastoFormValues {
  if (!expense) {
    return {
      categoria: "GAS",
      fecha_gasto: new Date().toISOString().slice(0, 10),
      monto: "" as unknown as number,
      moneda: "MXN",
      tc_gasto: "",
      medio_pago: "EFECTIVO",
      tarjeta_terminacion: "",
      estatus_comprobante: "SIN_COMPROBANTE",
      aeronave_id: "",
      vuelo_id: "",
      proveedor_id: "",
      notas: "",
    };
  }
  return {
    categoria: expense.categoria,
    fecha_gasto: expense.fecha_gasto,
    monto: Number(expense.monto),
    moneda: expense.moneda,
    tc_gasto: expense.tc_gasto ? Number(expense.tc_gasto) : "",
    medio_pago: expense.medio_pago,
    tarjeta_terminacion: expense.tarjeta_terminacion ?? "",
    estatus_comprobante: expense.estatus_comprobante,
    aeronave_id: expense.aeronave_id ?? "",
    vuelo_id: expense.vuelo_id ?? "",
    proveedor_id: expense.proveedor_id ?? "",
    notas: expense.notas ?? "",
  };
}
