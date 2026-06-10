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
import {
  createAirportAction,
  updateAirportAction,
} from "@/app/admin/airports/actions";
import { AirportFormSchema, type AirportFormValues } from "@/app/admin/airports/schema";
import type { Airport } from "@/types/airports";
import { Field } from "@/components/admin/form-field";

interface AirportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAirport?: Airport;
}

export function AirportFormDialog({ open, onOpenChange, initialAirport }: AirportFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialAirport;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AirportFormValues>({
    resolver: zodResolver(AirportFormSchema),
    defaultValues: defaults(initialAirport),
  });

  useEffect(() => {
    if (open) reset(defaults(initialAirport));
  }, [open, initialAirport, reset]);

  const aplicaXa = watch("tuas_aplica_xa");
  const aplicaXb = watch("tuas_aplica_xb");
  const aplicaN = watch("tuas_aplica_n");
  const paseExenta = watch("tuas_pase_abordar_exenta");
  const requierePermiso = watch("requiere_permiso");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateAirportAction(initialAirport!.id, values)
        : await createAirportAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Aeropuerto actualizado" : "Aeropuerto creado");
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar ${initialAirport!.iata}` : "Nuevo aeropuerto"}</DialogTitle>
          <DialogDescription>
            Configura el código IATA y las reglas TUAS por matrícula. CUN exenta XB/N; Cozumel
            cobra siempre (pase de abordar NO exenta).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="IATA" required error={errors.iata?.message}>
              <Input
                placeholder="CUN"
                maxLength={4}
                {...register("iata")}
                className="font-mono uppercase"
              />
            </Field>
            <Field label="ICAO" hint="Opcional" error={errors.icao?.message}>
              <Input
                placeholder="MMUN"
                maxLength={4}
                {...register("icao")}
                className="font-mono uppercase"
              />
            </Field>
            <Field label="País" hint="ISO 2 letras" required error={errors.pais?.message}>
              <Input
                placeholder="MX"
                maxLength={2}
                {...register("pais")}
                className="font-mono uppercase"
              />
            </Field>
          </div>

          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Aeropuerto Internacional de Cancún" {...register("nombre")} />
          </Field>

          <Field label="Ciudad" error={errors.ciudad?.message}>
            <Input placeholder="Cancún" {...register("ciudad")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Latitud"
              hint="Grados decimales · para calcular millas náuticas"
              error={errors.latitud?.message}
            >
              <Input
                type="number"
                step="0.0001"
                placeholder="21.0365"
                {...register("latitud")}
              />
            </Field>
            <Field label="Longitud" hint="Grados decimales" error={errors.longitud?.message}>
              <Input
                type="number"
                step="0.0001"
                placeholder="-86.8771"
                {...register("longitud")}
              />
            </Field>
          </div>

          <Field
            label="TUAS por pasajero"
            hint="USD por pasajero (configurable por aeropuerto)"
            required
            error={errors.tuas_default_usd_pax?.message}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              {...register("tuas_default_usd_pax")}
            />
          </Field>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-semibold">Reglas TUAS por matrícula</p>
            <SwitchRow
              label="TUAS aplica a matrícula XA"
              hint="XA paga TUAS en todos los aeropuertos por default"
              checked={aplicaXa}
              onCheckedChange={(c) => setValue("tuas_aplica_xa", c)}
            />
            <SwitchRow
              label="TUAS aplica a matrícula XB"
              hint="Apagar en CUN (XB exentas en Cancún)"
              checked={aplicaXb}
              onCheckedChange={(c) => setValue("tuas_aplica_xb", c)}
            />
            <SwitchRow
              label="TUAS aplica a matrícula N (USA)"
              hint="Apagar en CUN (N exentas en Cancún)"
              checked={aplicaN}
              onCheckedChange={(c) => setValue("tuas_aplica_n", c)}
            />
            <SwitchRow
              label="Pase de abordar exonera TUAS"
              hint="Apagar en Cozumel (cobra TUAS aunque haya pase)"
              checked={paseExenta}
              onCheckedChange={(c) => setValue("tuas_pase_abordar_exenta", c)}
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <SwitchRow
              label="Requiere permiso de pista"
              hint="Vuelos hacia/desde esta pista necesitan tramitar permiso antes (ej. HOL, MHL, PTU). Se marcan en el calendario hasta emitirlo."
              checked={requierePermiso}
              onCheckedChange={(c) => setValue("requiere_permiso", c)}
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear aeropuerto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean | undefined;
  onCheckedChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked ?? false} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function defaults(airport?: Airport): AirportFormValues {
  if (!airport) {
    return {
      iata: "",
      icao: "",
      nombre: "",
      ciudad: "",
      pais: "MX",
      latitud: "",
      longitud: "",
      tuas_default_usd_pax: 25,
      tuas_aplica_xa: true,
      tuas_aplica_xb: true,
      tuas_aplica_n: true,
      tuas_pase_abordar_exenta: true,
      requiere_permiso: false,
      notas: "",
    };
  }
  return {
    iata: airport.iata,
    icao: airport.icao ?? "",
    nombre: airport.nombre,
    ciudad: airport.ciudad ?? "",
    pais: airport.pais,
    latitud: airport.latitud ?? "",
    longitud: airport.longitud ?? "",
    tuas_default_usd_pax: Number(airport.tuas_default_usd_pax),
    tuas_aplica_xa: airport.tuas_aplica_xa,
    tuas_aplica_xb: airport.tuas_aplica_xb,
    tuas_aplica_n: airport.tuas_aplica_n,
    tuas_pase_abordar_exenta: airport.tuas_pase_abordar_exenta,
    requiere_permiso: airport.requiere_permiso,
    notas: airport.notas ?? "",
  };
}
