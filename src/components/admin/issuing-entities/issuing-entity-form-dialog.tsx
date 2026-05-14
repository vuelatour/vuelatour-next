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
import {
  createIssuingEntityAction,
  updateIssuingEntityAction,
} from "@/app/admin/issuing-entities/actions";
import {
  IssuingEntityFormSchema,
  type IssuingEntityFormValues,
} from "@/app/admin/issuing-entities/schema";
import type { IssuingEntity } from "@/types/issuing-entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEntity?: IssuingEntity;
}

export function IssuingEntityFormDialog({ open, onOpenChange, initialEntity }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialEntity;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IssuingEntityFormValues>({
    resolver: zodResolver(IssuingEntityFormSchema),
    defaultValues: defaults(initialEntity),
  });

  useEffect(() => {
    if (open) reset(defaults(initialEntity));
  }, [open, initialEntity, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateIssuingEntityAction(initialEntity!.id, values)
        : await createIssuingEntityAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Entidad actualizada" : "Entidad creada");
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
          <DialogTitle>
            {isEdit ? `Editar ${initialEntity!.codigo}` : "Nueva entidad fiscal emisora"}
          </DialogTitle>
          <DialogDescription>
            Razón social que emite CFDI 4.0. La empresa principal es Aero Charter Cancún.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Código interno" required hint="AEROCHARTER" error={errors.codigo?.message}>
              <Input {...register("codigo")} className="font-mono uppercase" maxLength={20} />
            </Field>
            <Field label="RFC" hint="12-13 chars" error={errors.rfc?.message}>
              <Input maxLength={13} {...register("rfc")} className="font-mono uppercase" />
            </Field>
            <Field
              label="Régimen SAT"
              hint="ej. 601 PM Régimen General"
              error={errors.regimen_fiscal_sat?.message}
            >
              <Input maxLength={10} {...register("regimen_fiscal_sat")} />
            </Field>
          </div>

          <Field label="Razón social" required error={errors.razon_social?.message}>
            <Input {...register("razon_social")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal" hint="5 dígitos" error={errors.codigo_postal?.message}>
              <Input maxLength={5} {...register("codigo_postal")} className="font-mono" />
            </Field>
            <Field label="PAC contratado" hint="SIIGO_NUBE, FACTURAMA, etc." error={errors.pac_proveedor?.message}>
              <Input {...register("pac_proveedor")} />
            </Field>
          </div>

          <Field label="Dirección" error={errors.direccion?.message}>
            <Textarea rows={2} {...register("direccion")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email facturación" error={errors.email_facturacion?.message}>
              <Input type="email" {...register("email_facturacion")} />
            </Field>
            <Field label="Teléfono" error={errors.telefono?.message}>
              <Input {...register("telefono")} />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear entidad"}
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

function defaults(entity?: IssuingEntity): IssuingEntityFormValues {
  if (!entity) {
    return {
      codigo: "",
      razon_social: "",
      rfc: "",
      regimen_fiscal_sat: "601",
      codigo_postal: "",
      direccion: "",
      email_facturacion: "",
      telefono: "",
      pac_proveedor: "SIIGO_NUBE",
      notas: "",
    };
  }
  return {
    codigo: entity.codigo,
    razon_social: entity.razon_social,
    rfc: entity.rfc ?? "",
    regimen_fiscal_sat: entity.regimen_fiscal_sat ?? "",
    codigo_postal: entity.codigo_postal ?? "",
    direccion: entity.direccion ?? "",
    email_facturacion: entity.email_facturacion ?? "",
    telefono: entity.telefono ?? "",
    pac_proveedor: entity.pac_proveedor ?? "",
    notas: entity.notas ?? "",
  };
}
