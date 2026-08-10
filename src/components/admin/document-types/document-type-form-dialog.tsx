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
  createDocumentTypeAction,
  updateDocumentTypeAction,
} from "@/app/admin/document-types/actions";
import {
  AMBITO_OPTIONS,
  DocumentTypeFormSchema,
  FORMA_OPTIONS,
  type DocumentTypeFormValues,
} from "@/app/admin/document-types/schema";
import type { DocumentType } from "@/types/expirations";
import { Field } from "@/components/admin/form-field";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: DocumentType;
}

export function DocumentTypeFormDialog({ open, onOpenChange, initialType }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialType;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DocumentTypeFormValues>({
    resolver: zodResolver(DocumentTypeFormSchema),
    defaultValues: defaults(initialType),
  });

  useEffect(() => {
    if (open) reset(defaults(initialType));
  }, [open, initialType, reset]);

  const esCritico = watch("es_critico");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateDocumentTypeAction(initialType!.id, values)
        : await createDocumentTypeAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Tipo actualizado" : "Tipo de documento creado");
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
          <DialogTitle>
            {isEdit ? `Editar ${initialType!.nombre}` : "Nuevo tipo de documento"}
          </DialogTitle>
          <DialogDescription>
            Lista maestra de tipos de documento. El umbral de alerta y si es crítico
            se definen aquí y aplican a todos sus vencimientos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Tarjeta de aeronavegabilidad" {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ámbito" required error={errors.ambito?.message}>
              <SearchableSelect
                options={AMBITO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={watch("ambito")}
                onChange={(v) => setValue("ambito", v as DocumentTypeFormValues["ambito"])}
                placeholder="Selecciona"
              />
            </Field>
            <Field
              label="Forma de vencimiento"
              hint="Sugerencia por defecto"
              error={errors.forma_default?.message}
            >
              <SearchableSelect
                options={FORMA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={watch("forma_default")}
                onChange={(v) =>
                  setValue("forma_default", v as DocumentTypeFormValues["forma_default"])
                }
              />
            </Field>
          </div>

          <Field
            label="Umbral de alerta (días)"
            hint="Días antes del vencimiento para marcarlo como PRÓXIMO"
            required
            error={errors.umbral_alerta_dias?.message}
          >
            <Input type="number" min={0} max={365} {...register("umbral_alerta_dias")} />
          </Field>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <Label className="text-sm">Documento crítico</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si está vencido, el avión se marca en rojo y administración
                recibe alerta diaria (ya no bloquea la asignación: la
                autoridad puede autorizar vuelos limitados).
              </p>
            </div>
            <Switch
              checked={esCritico ?? false}
              onCheckedChange={(c) => setValue("es_critico", c)}
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(t?: DocumentType): DocumentTypeFormValues {
  if (!t) {
    return {
      nombre: "",
      ambito: "AERONAVE",
      forma_default: "FECHA",
      umbral_alerta_dias: 30,
      es_critico: false,
      notas: "",
    };
  }
  return {
    nombre: t.nombre,
    ambito: t.ambito,
    forma_default: t.forma_default,
    umbral_alerta_dias: t.umbral_alerta_dias,
    es_critico: t.es_critico,
    notas: t.notas ?? "",
  };
}
