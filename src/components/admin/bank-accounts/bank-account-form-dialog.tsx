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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createBankAccountAction,
  updateBankAccountAction,
} from "@/app/admin/bank-accounts/actions";
import {
  BankAccountFormSchema,
  type BankAccountFormValues,
} from "@/app/admin/bank-accounts/schema";
import type { BankAccount } from "@/types/bank-accounts";
import { Field } from "@/components/admin/form-field";

const MONEDAS = [
  { value: "MXN", label: "Pesos mexicanos (MXN)" },
  { value: "USD", label: "Dólares (USD)" },
];

const RAZONES = [
  { value: "AEROCHARTER", label: "Aero Charter Cancún" },
  { value: "AERODINAMICA", label: "Aerodinámica de Monterrey" },
  { value: "OTRA", label: "Otra entidad" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAccount?: BankAccount;
}

export function BankAccountFormDialog({ open, onOpenChange, initialAccount }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialAccount;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BankAccountFormValues>({
    resolver: zodResolver(BankAccountFormSchema),
    defaultValues: defaults(initialAccount),
  });

  useEffect(() => {
    if (open) reset(defaults(initialAccount));
  }, [open, initialAccount, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateBankAccountAction(initialAccount!.id, values)
        : await createBankAccountAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Cuenta actualizada" : "Cuenta creada");
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
          <DialogTitle>{isEdit ? "Editar cuenta" : "Nueva cuenta bancaria"}</DialogTitle>
          <DialogDescription>
            Cuentas de las entidades fiscales. La razón social define qué entidad emite la cuenta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alias" required error={errors.alias?.message}>
              <Input placeholder="GASTOS GNRAL" {...register("alias")} />
            </Field>
            <Field label="Banco" required error={errors.banco?.message}>
              <Input placeholder="Scotiabank" {...register("banco")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda" required error={errors.moneda?.message}>
              <SearchableSelect
                options={MONEDAS}
                value={(watch("moneda") as string | undefined) ?? "MXN"}
                onChange={(v) => setValue("moneda", v as never)}
                placeholder="Moneda"
              />
            </Field>
            <Field label="Razón social" required error={errors.razon_social?.message}>
              <SearchableSelect
                options={RAZONES}
                value={(watch("razon_social") as string | undefined) ?? "AEROCHARTER"}
                onChange={(v) => setValue("razon_social", v as never)}
                placeholder="Razón social"
              />
            </Field>
          </div>

          <Field label="Número de cuenta" error={errors.numero_cuenta?.message}>
            <Input {...register("numero_cuenta")} className="font-mono" />
          </Field>

          <Field label="CLABE" hint="18 dígitos" error={errors.clabe?.message}>
            <Input maxLength={18} {...register("clabe")} className="font-mono" />
          </Field>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(account?: BankAccount): BankAccountFormValues {
  if (!account) {
    return {
      alias: "",
      banco: "",
      numero_cuenta: "",
      clabe: "",
      moneda: "MXN",
      razon_social: "AEROCHARTER",
      notas: "",
    };
  }
  return {
    alias: account.alias,
    banco: account.banco,
    numero_cuenta: account.numero_cuenta ?? "",
    clabe: account.clabe ?? "",
    moneda: account.moneda,
    razon_social: account.razon_social,
    notas: account.notas ?? "",
  };
}
