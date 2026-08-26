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
  createAircraftAction,
  updateAircraftAction,
} from "@/app/admin/aircraft/actions";
import {
  AircraftFormSchema,
  type AircraftFormValues,
} from "@/app/admin/aircraft/schema";
import type { Aircraft } from "@/types/aircraft";
import { Field } from "@/components/admin/form-field";

interface AircraftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAircraft?: Aircraft;
}

/**
 * Tonos sugeridos para el color de calendario de la aeronave. NO incluye los
 * colores reservados del sistema (sin asignar #8B5CF6, permiso #F59E0B, externo
 * #F0DCDB, respaldo #9CA3AF) para evitar que un vuelo se confunda con un estado.
 */
const SUGGESTED_AIRCRAFT_COLORS = [
  "#3B82F6", // azul
  "#0EA5E9", // celeste
  "#06B6D4", // cian
  "#10B981", // esmeralda
  "#84CC16", // lima
  "#EAB308", // amarillo
  "#EF4444", // rojo
  "#EC4899", // rosa fuerte
  "#D946EF", // fucsia
  "#14B8A6", // verde azulado
  "#6366F1", // índigo
  "#F97316", // naranja fuerte
];

export function AircraftFormDialog({
  open,
  onOpenChange,
  initialAircraft,
}: AircraftFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialAircraft;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AircraftFormValues>({
    resolver: zodResolver(AircraftFormSchema),
    defaultValues: defaults(initialAircraft),
  });

  useEffect(() => {
    if (open) reset(defaults(initialAircraft));
  }, [open, initialAircraft, reset]);

  const activa = watch("activa");
  const colorValue = watch("color_calendario") ?? "";

  const onSubmit = handleSubmit((values) => {
    const payload: AircraftFormValues = { ...values };
    // Aportación AFAC: el update descarta los campos vacíos (""), así que si
    // el avión TENÍA valor y el usuario vació el campo, mandamos null
    // explícito para borrar la provisión. Nunca viaja "" al API.
    if (
      isEdit &&
      initialAircraft?.permiso_afac_usd_hr != null &&
      (payload.permiso_afac_usd_hr === "" || payload.permiso_afac_usd_hr == null)
    ) {
      payload.permiso_afac_usd_hr = null;
    }
    // Motor (HP): misma regla — vaciar el campo en edición borra el valor.
    if (
      isEdit &&
      initialAircraft?.motor_hp != null &&
      ((payload.motor_hp as unknown) === "" || payload.motor_hp == null)
    ) {
      payload.motor_hp = null;
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateAircraftAction(initialAircraft!.id, payload)
        : await createAircraftAction(payload);

      if (result.ok) {
        toast.success(isEdit ? "Aeronave actualizada" : "Aeronave creada");
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
          <DialogTitle>{isEdit ? "Editar aeronave" : "Nueva aeronave"}</DialogTitle>
          <DialogDescription>
            Datos maestros del avión. Las tarifas y velocidad alimentan el cotizador; la
            reserva overhaul se acumula por hora volada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Matrícula" required error={errors.matricula?.message}>
              <Input
                placeholder="XB-PEV"
                maxLength={10}
                className="font-mono uppercase"
                {...register("matricula")}
              />
            </Field>
            <Field label="País de registro" required error={errors.pais_registro?.message}>
              <SearchableSelect
                options={[
                  { value: "MX", label: "México (MX)" },
                  { value: "USA", label: "Estados Unidos (USA)" },
                ]}
                value={(watch("pais_registro") as string | undefined) ?? ""}
                onChange={(v) => setValue("pais_registro", v as never)}
                placeholder="Selecciona"
              />
            </Field>
          </div>

          <Field label="Modelo" required error={errors.modelo?.message}>
            <Input placeholder="Cessna 206" {...register("modelo")} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            {/* Tipo de avión: además del dato técnico, decide el formato de
                la bitácora de tacómetros (Planeador vs Motor–Hélice). */}
            <Field label="Tipo" required error={errors.num_motores?.message}>
              <SearchableSelect
                options={[
                  { value: "1", label: "Monomotor" },
                  { value: "2", label: "Bimotor" },
                ]}
                value={String(watch("num_motores") ?? "")}
                onChange={(v) => setValue("num_motores", Number(v) as never)}
                placeholder="Selecciona"
              />
            </Field>
            <Field
              label="Vel. crucero"
              required
              hint="nudos"
              error={errors.velocidad_crucero_kts?.message}
            >
              <Input type="number" min={1} placeholder="120" {...register("velocidad_crucero_kts")} />
            </Field>
            <Field label="Asientos" required hint="sin piloto" error={errors.asientos?.message}>
              <Input type="number" min={1} placeholder="5" {...register("asientos")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Motor (HP)"
              hint="por motor — tarjeta del PDF"
              error={errors.motor_hp?.message}
            >
              <Input type="number" min={1} placeholder="310" {...register("motor_hp")} />
            </Field>
            <Field
              label="Características (PDF)"
              hint="una por línea"
              error={errors.caracteristicas?.message as string | undefined}
            >
              <Textarea
                rows={3}
                placeholder={"Ala alta con visibilidad panorámica\nAire acondicionado"}
                {...register("caracteristicas")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="USD/hr público" error={errors.tarifa_hora_pub_usd?.message}>
              <Input type="number" min={0} step="0.01" placeholder="750" {...register("tarifa_hora_pub_usd")} />
            </Field>
            <Field label="USD/hr broker" error={errors.tarifa_hora_broker_usd?.message}>
              <Input type="number" min={0} step="0.01" placeholder="650" {...register("tarifa_hora_broker_usd")} />
            </Field>
            <Field
              label="Reserva OH/hr"
              hint="USD"
              error={errors.reserva_overhaul_hr_usd?.message}
            >
              <Input type="number" min={0} step="0.01" placeholder="55" {...register("reserva_overhaul_hr_usd")} />
            </Field>
          </div>

          {isEdit && (
            <Field
              label="Aportación AFAC (USD por hora cobrada)"
              hint="Provisión por volar con matrícula extranjera (p. ej. 100). Vacío = no aplica."
              error={errors.permiso_afac_usd_hr?.message}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="100"
                {...register("permiso_afac_usd_hr")}
              />
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Base (IATA)" hint="default CUN" error={errors.ubicacion_base?.message}>
              <Input placeholder="CUN" maxLength={4} className="font-mono uppercase" {...register("ubicacion_base")} />
            </Field>
            <Field label="Color calendario" hint="#RRGGBB" error={errors.color_calendario?.message}>
              <div className="flex items-center gap-2">
                <span
                  className="h-[42px] w-9 shrink-0 rounded-lg border border-border"
                  style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(colorValue) ? colorValue : "transparent" }}
                  aria-hidden
                />
                <Input type="text" placeholder="#3B82F6" {...register("color_calendario")} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SUGGESTED_AIRCRAFT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setValue("color_calendario", c, { shouldValidate: true })
                    }
                    title={c}
                    className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                      colorValue.toUpperCase() === c ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/50" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>
            <div className="flex flex-col justify-end">
              <div className="flex items-center justify-between rounded-lg border border-border px-3 h-[42px]">
                <Label className="text-sm font-medium">Activa</Label>
                <Switch
                  checked={activa ?? true}
                  onCheckedChange={(c) => setValue("activa", c)}
                />
              </div>
            </div>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear aeronave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(a?: Aircraft): AircraftFormValues {
  if (!a) {
    return {
      matricula: "",
      modelo: "",
      pais_registro: "MX",
      num_motores: 1,
      velocidad_crucero_kts: "" as unknown as number,
      asientos: "" as unknown as number,
      motor_hp: "" as unknown as number,
      caracteristicas: "" as unknown as string[],
      tarifa_hora_pub_usd: "",
      tarifa_hora_broker_usd: "",
      reserva_overhaul_hr_usd: "",
      permiso_afac_usd_hr: "",
      color_calendario: "",
      ubicacion_base: "CUN",
      activa: true,
      notas: "",
    };
  }
  return {
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    num_motores: a.num_motores,
    velocidad_crucero_kts: a.velocidad_crucero_kts as unknown as number,
    asientos: a.asientos,
    motor_hp: (a.motor_hp ?? "") as unknown as number,
    caracteristicas: (a.caracteristicas ?? []).join("\n") as unknown as string[],
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ?? "",
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd ?? "",
    reserva_overhaul_hr_usd: a.reserva_overhaul_hr_usd ?? "",
    permiso_afac_usd_hr: a.permiso_afac_usd_hr ?? "",
    color_calendario: a.color_calendario ?? "",
    ubicacion_base: a.ubicacion_base ?? "",
    activa: a.activa,
    notas: a.notas ?? "",
  };
}
