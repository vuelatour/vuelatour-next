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
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createClientAction,
  updateClientAction,
} from "@/app/admin/clients/actions";
import { ClientFormSchema, type ClientFormValues } from "@/app/admin/clients/schema";
import type { Client } from "@/types/clients";

const CANALES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "LANDING", label: "Landing" },
  { value: "LLAMADA", label: "Llamada" },
  { value: "REFERIDO", label: "Referido" },
];

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClient?: Client;
  /** Al crear (no editar): permite seleccionar al cliente recién creado in situ (ej. desde el cotizador). */
  onCreated?: (client: Client) => void;
}

export function ClientFormDialog({ open, onOpenChange, initialClient, onCreated }: ClientFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialClient;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: defaults(initialClient),
  });

  useEffect(() => {
    if (open) reset(defaults(initialClient));
  }, [open, initialClient, reset]);

  const esBroker = watch("es_broker");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateClientAction(initialClient!.id, values)
        : await createClientAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Cliente actualizado" : "Cliente creado");
        if (!isEdit && result.data) onCreated?.(result.data);
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
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            Persona o empresa que solicita vuelos. Si es broker, se aplica la tarifa broker en
            cotizaciones por default.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Persona o empresa" {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" hint="WhatsApp preferente" error={errors.telefono?.message}>
              <Input placeholder="+52 998..." {...register("telefono")} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="cliente@ejemplo.com" {...register("email")} />
            </Field>
          </div>

          <Field
            label="Razón social default"
            hint="Para 'factúrame como la última vez'"
            error={errors.razon_social_default?.message}
          >
            <Input {...register("razon_social_default")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="RFC" error={errors.rfc?.message}>
              <Input placeholder="XAXX010101000" maxLength={13} {...register("rfc")} className="font-mono uppercase" />
            </Field>
            <Field label="Canal de origen" error={errors.canal_origen?.message}>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin especificar" },
                  ...CANALES.map((c) => ({ value: c.value, label: c.label })),
                ]}
                value={(watch("canal_origen") as string | undefined) ?? ""}
                onChange={(v) => setValue("canal_origen", v as never)}
                placeholder="Sin especificar"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">¿Es broker?</Label>
              <p className="text-xs text-muted-foreground">
                Aplicar tarifa broker (más barata) por default en cotizaciones.
              </p>
            </div>
            <Switch
              checked={esBroker}
              onCheckedChange={(c) => setValue("es_broker", c)}
            />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
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

function defaults(client?: Client): ClientFormValues {
  if (!client) {
    return {
      nombre: "",
      telefono: "",
      email: "",
      razon_social_default: "",
      rfc: "",
      canal_origen: "",
      es_broker: false,
      notas: "",
    };
  }
  return {
    nombre: client.nombre,
    telefono: client.telefono ?? "",
    email: client.email ?? "",
    razon_social_default: client.razon_social_default ?? "",
    rfc: client.rfc ?? "",
    canal_origen: client.canal_origen ?? "",
    es_broker: client.es_broker,
    notas: client.notas ?? "",
  };
}
