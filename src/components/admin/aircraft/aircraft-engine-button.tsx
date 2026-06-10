"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
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
  createEngineAction,
  updateEngineAction,
} from "@/app/admin/aircraft/actions";
import { EngineFormSchema, type EngineFormValues } from "@/app/admin/aircraft/schema";
import type { Motor } from "@/types/aircraft";
import { Field } from "@/components/admin/form-field";

export function AircraftEngineButton({
  aircraftId,
  engine,
}: {
  aircraftId: string;
  engine?: Motor;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!engine;

  return (
    <>
      {isEdit ? (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(true)} title="Editar motor">
          <PencilSquareIcon className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar
        </Button>
      )}
      <EngineDialog open={open} onOpenChange={setOpen} aircraftId={aircraftId} engine={engine} />
    </>
  );
}

function EngineDialog({
  open,
  onOpenChange,
  aircraftId,
  engine,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  engine?: Motor;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!engine;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EngineFormValues>({
    resolver: zodResolver(EngineFormSchema),
    defaultValues: defaults(engine),
  });

  useEffect(() => {
    if (open) reset(defaults(engine));
  }, [open, engine, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = isEdit
        ? await updateEngineAction(aircraftId, engine!.id, values)
        : await createEngineAction(aircraftId, values);
      if (res.ok) {
        toast.success(isEdit ? "Motor actualizado" : "Motor agregado");
        onOpenChange(false);
      } else if (res.fieldErrors) {
        const f = Object.keys(res.fieldErrors)[0];
        toast.error(`${f}: ${res.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(res.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar motor" : "Agregar motor"}</DialogTitle>
          <DialogDescription>
            El motor es una entidad propia: sus horas totales son lineales y viajan con él si se
            trasplanta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Posición" required error={errors.posicion?.message}>
              <SearchableSelect
                options={[
                  { value: "UNICO", label: "Único" },
                  { value: "IZQUIERDO", label: "Izquierdo" },
                  { value: "DERECHO", label: "Derecho" },
                ]}
                value={(watch("posicion") as string | undefined) ?? "UNICO"}
                onChange={(v) => setValue("posicion", v as never)}
                placeholder="Posición"
              />
            </Field>
            <Field label="Tipo" required error={errors.tipo?.message}>
              <SearchableSelect
                options={[
                  { value: "PISTON", label: "Pistón" },
                  { value: "TURBINA", label: "Turbina" },
                ]}
                value={(watch("tipo") as string | undefined) ?? ""}
                onChange={(v) => setValue("tipo", v as never)}
                placeholder="Tipo"
              />
            </Field>
          </div>
          <Field label="Número de serie" required error={errors.numero_serie?.message}>
            <Input className="font-mono" placeholder="S/N" {...register("numero_serie")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fabricante" error={errors.fabricante?.message}>
              <Input placeholder="Continental…" {...register("fabricante")} />
            </Field>
            <Field label="Modelo" error={errors.modelo?.message}>
              <Input placeholder="IO-540…" {...register("modelo")} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Horas totales" error={errors.horas_totales?.message}>
              <Input type="number" step="0.01" min={0} {...register("horas_totales")} />
            </Field>
            <Field label="TURM" hint="al últ. OH" error={errors.turm?.message}>
              <Input type="number" step="0.01" min={0} {...register("turm")} />
            </Field>
            <Field label="TBO" required hint="horas" error={errors.tbo_horas?.message}>
              <Input type="number" step="0.01" min={1} placeholder="1700" {...register("tbo_horas")} />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar motor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(m?: Motor): EngineFormValues {
  if (!m) {
    return {
      posicion: "UNICO",
      numero_serie: "",
      tipo: "" as unknown as "PISTON",
      fabricante: "",
      modelo: "",
      horas_totales: "",
      turm: "",
      tbo_horas: "" as unknown as number,
      notas: "",
    };
  }
  return {
    posicion: m.posicion,
    numero_serie: m.numero_serie,
    tipo: m.tipo,
    fabricante: "",
    modelo: "",
    horas_totales: m.horas_totales ?? "",
    turm: m.turm ?? "",
    tbo_horas: m.tbo_horas as unknown as number,
    notas: "",
  };
}
