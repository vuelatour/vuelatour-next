"use client";

import { useEffect, useState, useTransition } from "react";
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
  createRouteAction,
  updateRouteAction,
} from "@/app/admin/routes/actions";
import { RouteFormSchema, type RouteFormValues } from "@/app/admin/routes/schema";
import type { Route } from "@/types/routes";

interface RouteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoute?: Route;
}

const FUENTE_OPTIONS = [
  { value: "GOOGLE_EARTH", label: "Google Earth" },
  { value: "FOREFLIGHT", label: "ForeFlight" },
  { value: "MANUAL", label: "Manual" },
  { value: "APROXIMACION", label: "Aproximación" },
];

export function RouteFormDialog({ open, onOpenChange, initialRoute }: RouteFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialRoute;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RouteFormValues>({
    resolver: zodResolver(RouteFormSchema),
    defaultValues: defaults(initialRoute),
  });

  // Resincronizar el form cuando cambia la ruta a editar o cuando se cierra
  useEffect(() => {
    if (open) reset(defaults(initialRoute));
  }, [open, initialRoute, reset]);

  const esRedondoAuto = watch("es_redondo_auto");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateRouteAction(initialRoute!.id, values)
        : await createRouteAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Ruta actualizada" : "Ruta creada");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ruta" : "Nueva ruta"}</DialogTitle>
          <DialogDescription>
            Define el par origen-destino y las millas náuticas one-way. El motor de cotización
            multiplicará × 2 automáticamente para vuelos redondos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Origen (IATA)"
              required
              error={errors.origen_iata?.message}
            >
              <Input
                placeholder="CUN"
                maxLength={4}
                {...register("origen_iata")}
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase();
                  register("origen_iata").onChange(e);
                }}
                className="font-mono uppercase"
              />
            </Field>
            <Field
              label="Destino (IATA)"
              required
              error={errors.destino_iata?.message}
            >
              <Input
                placeholder="CZM"
                maxLength={4}
                {...register("destino_iata")}
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase();
                  register("destino_iata").onChange(e);
                }}
                className="font-mono uppercase"
              />
            </Field>
          </div>

          <Field
            label="Millas náuticas"
            hint={esRedondoAuto ? "One-way; el motor multiplica × 2" : "Total del recorrido"}
            required
            error={errors.millas_nauticas?.message}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="63.14"
              {...register("millas_nauticas")}
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="es_redondo_auto" className="text-sm font-medium">
                Redondo automático
              </Label>
              <p className="text-xs text-muted-foreground">
                Multiplica las NM × 2 al cotizar (CUN-X-CUN). Apagar para multi-escala.
              </p>
            </div>
            <Switch
              id="es_redondo_auto"
              checked={esRedondoAuto}
              onCheckedChange={(c) => setValue("es_redondo_auto", c)}
            />
          </div>

          <Field
            label="Número de aterrizajes"
            hint="Cada aterrizaje suma 0.15 hrs de calzos"
            required
            error={errors.num_aterrizajes?.message}
          >
            <Input type="number" min={1} {...register("num_aterrizajes")} />
          </Field>

          <Field label="Fuente" hint="Cómo se obtuvo el dato" error={errors.fuente?.message}>
            <SearchableSelect
              options={[
                { value: "", label: "Sin especificar" },
                ...FUENTE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ]}
              value={watch("fuente") ?? ""}
              onChange={(v) => setValue("fuente", v)}
              placeholder="Sin especificar"
            />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ruta"}
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

function defaults(route?: Route): RouteFormValues {
  if (!route) {
    return {
      origen_iata: "",
      destino_iata: "",
      millas_nauticas: 0,
      es_redondo_auto: true,
      num_aterrizajes: 2,
      fuente: "",
      notas: "",
    };
  }
  return {
    origen_iata: route.origen_iata,
    destino_iata: route.destino_iata,
    millas_nauticas: Number(route.millas_nauticas),
    es_redondo_auto: route.es_redondo_auto,
    num_aterrizajes: route.num_aterrizajes,
    fuente: route.fuente ?? "",
    notas: route.notas ?? "",
  };
}
