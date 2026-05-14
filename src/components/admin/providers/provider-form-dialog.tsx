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
  createProviderAction,
  updateProviderAction,
} from "@/app/admin/providers/actions";
import { ProviderFormSchema, type ProviderFormValues } from "@/app/admin/providers/schema";
import type { Provider } from "@/types/providers";

const TIPOS = [
  { value: "NACIONAL", label: "Nacional (RFC mexicano)" },
  { value: "EXTRANJERO", label: "Extranjero (sin RFC, ej. Aircraft Spruce USA)" },
  { value: "GENERICO_LOCAL", label: "Genérico local (catchall)" },
];

interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: Provider;
}

export function ProviderFormDialog({ open, onOpenChange, initialProvider }: ProviderFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialProvider;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    resolver: zodResolver(ProviderFormSchema),
    defaultValues: defaults(initialProvider),
  });

  useEffect(() => {
    if (open) reset(defaults(initialProvider));
  }, [open, initialProvider, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateProviderAction(initialProvider!.id, values)
        : await createProviderAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Proveedor actualizado" : "Proveedor creado");
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>
            Empresa o persona que emite facturas a Vuelatour. Los proveedores se vinculan a gastos
            y facturas recibidas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" required error={errors.tipo?.message}>
              <select
                {...register("tipo")}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="País" hint="ISO 2 letras" error={errors.pais?.message}>
              <Input
                placeholder="MX"
                maxLength={2}
                {...register("pais")}
                className="font-mono uppercase"
              />
            </Field>
          </div>

          <Field label="RFC" hint="Solo aplica a tipo NACIONAL" error={errors.rfc?.message}>
            <Input
              placeholder="XAXX010101000"
              maxLength={13}
              {...register("rfc")}
              className="font-mono uppercase"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...register("email")} />
            </Field>
            <Field label="Teléfono" error={errors.telefono?.message}>
              <Input {...register("telefono")} />
            </Field>
          </div>

          <Field label="Persona de contacto" error={errors.contacto?.message}>
            <Input {...register("contacto")} />
          </Field>

          <Field label="Dirección" error={errors.direccion?.message}>
            <Textarea rows={2} {...register("direccion")} />
          </Field>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear proveedor"}
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

function defaults(provider?: Provider): ProviderFormValues {
  if (!provider) {
    return {
      nombre: "",
      rfc: "",
      tipo: "NACIONAL",
      pais: "",
      email: "",
      telefono: "",
      direccion: "",
      contacto: "",
      notas: "",
    };
  }
  return {
    nombre: provider.nombre,
    rfc: provider.rfc ?? "",
    tipo: provider.tipo,
    pais: provider.pais ?? "",
    email: provider.email ?? "",
    telefono: provider.telefono ?? "",
    direccion: provider.direccion ?? "",
    contacto: provider.contacto ?? "",
    notas: provider.notas ?? "",
  };
}
