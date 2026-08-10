"use client";

import { useEffect, useMemo, useTransition } from "react";
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
  createExpirationAction,
  updateExpirationAction,
} from "@/app/admin/expirations/actions";
import {
  ExpirationFormSchema,
  type ExpirationFormValues,
} from "@/app/admin/expirations/schema";
import { FORMA_OPTIONS } from "@/app/admin/document-types/schema";
import type { DocumentType, Expiration } from "@/types/expirations";
import { Field } from "@/components/admin/form-field";
import { DocumentoField } from "./documento-field";

export interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}
export interface PilotOption {
  id: string;
  nombre: string;
  es_piloto_externo?: boolean;
}
export interface EngineOption {
  id: string;
  numero_serie: string;
  aeronave_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExpiration?: Expiration;
  documentTypes: DocumentType[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  engines: EngineOption[];
}

export function ExpirationFormDialog({
  open,
  onOpenChange,
  initialExpiration,
  documentTypes,
  aircraft,
  pilots,
  engines,
}: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialExpiration;

  const {
    handleSubmit,
    register,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpirationFormValues>({
    resolver: zodResolver(ExpirationFormSchema),
    defaultValues: defaults(initialExpiration),
  });

  useEffect(() => {
    if (open) reset(defaults(initialExpiration));
  }, [open, initialExpiration, reset]);

  const tipoId = watch("tipo_documento_id");
  const vencePor = watch("vence_por");
  const selectedTipo = useMemo(
    () => documentTypes.find((t) => t.id === tipoId),
    [documentTypes, tipoId],
  );
  const ambito = selectedTipo?.ambito;

  const matriculaById = useMemo(
    () => new Map(aircraft.map((a) => [a.id, a.matricula])),
    [aircraft],
  );

  const onTipoChange = (v: string) => {
    setValue("tipo_documento_id", v);
    const tipo = documentTypes.find((t) => t.id === v);
    if (tipo) setValue("vence_por", tipo.forma_default);
    // limpia objetivos de otros ambitos
    setValue("aeronave_id", "");
    setValue("piloto_id", "");
    setValue("motor_id", "");
  };

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // Al EDITAR un "por horas" y vaciar la fecha calendario, hay que mandar
      // null explícito (el "" se descarta y el PATCH conservaría la anterior).
      const payload =
        isEdit && values.vence_por === "HORAS" && !values.fecha_vencimiento
          ? { ...values, fecha_vencimiento: null }
          : values;
      const result = isEdit
        ? await updateExpirationAction(initialExpiration!.id, payload)
        : await createExpirationAction(payload);

      if (result.ok) {
        toast.success(isEdit ? "Vencimiento actualizado" : "Vencimiento registrado");
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
          <DialogTitle>{isEdit ? "Editar vencimiento" : "Nuevo vencimiento"}</DialogTitle>
          <DialogDescription>
            Registra un documento o componente con fecha u horas límite. El estado
            (vigente / próximo / vencido) lo calcula el sistema.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Tipo de documento" required error={errors.tipo_documento_id?.message}>
            <SearchableSelect
              options={documentTypes.map((t) => ({
                value: t.id,
                label: t.nombre,
                description: `Ámbito: ${t.ambito.toLowerCase()}`,
              }))}
              value={tipoId ?? ""}
              onChange={onTipoChange}
              placeholder="Selecciona un tipo"
            />
          </Field>

          {ambito === "AERONAVE" && (
            <Field label="Aeronave" required error={errors.aeronave_id?.message}>
              <SearchableSelect
                options={aircraft.map((a) => ({
                  value: a.id,
                  label: a.matricula,
                  description: a.modelo,
                }))}
                value={watch("aeronave_id") ?? ""}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Selecciona aeronave"
              />
            </Field>
          )}
          {ambito === "PILOTO" && (
            <Field label="Piloto" required error={errors.piloto_id?.message}>
              <SearchableSelect
                options={pilots.map((p) => ({
                  value: p.id,
                  label: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
                }))}
                value={watch("piloto_id") ?? ""}
                onChange={(v) => setValue("piloto_id", v)}
                placeholder="Selecciona piloto"
              />
            </Field>
          )}
          {ambito === "MOTOR" && (
            <Field label="Motor" required error={errors.motor_id?.message}>
              <SearchableSelect
                options={engines.map((e) => ({
                  value: e.id,
                  label: e.numero_serie,
                  description: matriculaById.get(e.aeronave_id) ?? "",
                }))}
                value={watch("motor_id") ?? ""}
                onChange={(v) => setValue("motor_id", v)}
                placeholder="Selecciona motor"
              />
            </Field>
          )}
          {!ambito && (
            <p className="text-xs text-muted-foreground">
              Selecciona primero un tipo de documento para elegir el objetivo.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vence por" required error={errors.vence_por?.message}>
              <SearchableSelect
                options={FORMA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={vencePor}
                onChange={(v) => setValue("vence_por", v as ExpirationFormValues["vence_por"])}
              />
            </Field>
            {vencePor === "FECHA" && (
              <Field
                label="Fecha de vencimiento"
                required
                error={errors.fecha_vencimiento?.message}
              >
                <Input type="date" {...register("fecha_vencimiento")} />
              </Field>
            )}
            {vencePor === "HORAS" && (
              <Field
                label="Horas límite"
                hint="Horas de motor al vencer"
                required
                error={errors.horas_limite?.message}
              >
                <Input type="number" step="0.1" min={0} {...register("horas_limite")} />
              </Field>
            )}
            {vencePor === "HORAS" && (
              <Field
                label="Vence también por fecha"
                hint="Opcional: límite calendario (ej. TBO 12 años). Manda lo que ocurra primero."
                error={errors.fecha_vencimiento?.message}
              >
                <Input type="date" {...register("fecha_vencimiento")} />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Umbral de alerta (días)"
              hint="Opcional. Vacío = usa el del tipo de documento"
              error={errors.umbral_alerta_dias?.message}
            >
              <Input
                type="number"
                min={0}
                max={365}
                placeholder="Default del tipo"
                disabled={vencePor === "PERMANENTE"}
                {...register("umbral_alerta_dias")}
              />
            </Field>
            <Field
              label="Referencia"
              hint="Número de póliza / folio"
              error={errors.referencia?.message}
            >
              <Input placeholder="Opcional" {...register("referencia")} />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>

          <Field
            label="Copia del documento"
            hint="Adjunta el permiso/licencia escaneado o fotografiado (PDF o imagen, máx. 10 MB). Se guarda en privado; solo la oficina lo ve."
          >
            <DocumentoField
              value={(watch("archivo_url") as string | null) ?? null}
              onChange={(path) =>
                setValue("archivo_url", path, { shouldDirty: true })
              }
              expirationId={initialExpiration?.id}
              savedValue={initialExpiration?.archivo_url ?? null}
            />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(v?: Expiration): ExpirationFormValues {
  if (!v) {
    return {
      tipo_documento_id: "",
      vence_por: "FECHA",
      aeronave_id: "",
      piloto_id: "",
      motor_id: "",
      fecha_vencimiento: "",
      horas_limite: "",
      umbral_alerta_dias: "",
      referencia: "",
      notas: "",
      archivo_url: null,
    };
  }
  return {
    tipo_documento_id: v.tipo_documento_id,
    vence_por: v.vence_por,
    aeronave_id: v.aeronave_id ?? "",
    piloto_id: v.piloto_id ?? "",
    motor_id: v.motor_id ?? "",
    fecha_vencimiento: v.fecha_vencimiento ?? "",
    horas_limite: v.horas_limite ? Number(v.horas_limite) : "",
    umbral_alerta_dias: v.umbral_alerta_dias ?? "",
    referencia: v.referencia ?? "",
    notas: v.notas ?? "",
    archivo_url: v.archivo_url ?? null,
  };
}
