"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
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
import { fmtDecimal } from "@/lib/format";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createEngineAction,
  deleteEngineAction,
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
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setOpen(true)}
          title="Editar motor"
          aria-label="Editar motor"
        >
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

export function AircraftEngineDeleteButton({
  aircraftId,
  engine,
}: {
  aircraftId: string;
  engine: Motor;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onDelete = () =>
    startTransition(async () => {
      const res = await deleteEngineAction(aircraftId, engine.id);
      if (res.ok) {
        toast.success("Motor eliminado");
        setOpen(false);
      } else {
        toast.error(res.error ?? "No se pudo eliminar el motor");
      }
    });

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        title="Eliminar motor"
        aria-label="Eliminar motor"
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar motor</DialogTitle>
            <DialogDescription>
              Se eliminará el motor <span className="font-medium">{engine.posicion}</span> (serie{" "}
              <span className="font-mono">{engine.numero_serie}</span>) junto con su historial de
              traslados y los vencimientos ligados a él. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar motor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    formState: { errors, dirtyFields },
  } = useForm<EngineFormValues>({
    resolver: zodResolver(EngineFormSchema),
    defaultValues: defaults(engine),
  });

  useEffect(() => {
    if (open) reset(defaults(engine));
  }, [open, engine, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // En edición, los campos de horas se mandan SOLO si el usuario los tocó:
      // reenviar `horas_totales` sin cambios re-ancla la referencia del Hobbs
      // en el API y borra las horas vivas acumuladas del motor.
      let payload: Partial<EngineFormValues> = values;
      if (isEdit) {
        payload = { ...values };
        if (!dirtyFields.horas_totales) delete payload.horas_totales;
        if (!dirtyFields.turm_componente) delete payload.turm_componente;
        if (!dirtyFields.tbo_horas) delete payload.tbo_horas;
        // Campo vaciado a propósito → null para borrar el valor guardado
        // (el "" se descarta en la action y no borraría nada).
        for (const k of ["fabricante", "modelo", "notas", "tbo_fecha"] as const) {
          if (dirtyFields[k] && payload[k] === "") payload[k] = null;
        }
      }
      const res = isEdit
        ? await updateEngineAction(aircraftId, engine!.id, payload)
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
            El motor es una entidad propia: sus horas suben solas con cada vuelo y viajan con él
            si se trasplanta a otro avión.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {isEdit && engine?.horas_actuales != null && (
            /* La duda #1 de la oficina: "¿estos números se quedan fijos?" —
               NO: aquí se muestra la vida VIVA (base + volado desde el ancla)
               para que se vea que el sistema suma solo con cada vuelo. */
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs space-y-1">
              <p className="font-medium text-green-700 dark:text-green-400">
                Hoy lleva {fmtDecimal(engine.horas_actuales)} h de vida — y suben solas con cada
                vuelo.
              </p>
              <p className="text-muted-foreground">
                = {fmtDecimal(Number(engine.horas_totales))} h de base (la foto de la bitácora)
                {engine.aeronave_horas_ref != null && engine.hobbs_avion != null
                  ? ` + lo volado desde el tacómetro ${fmtDecimal(engine.aeronave_horas_ref)} (el avión va en ${fmtDecimal(engine.hobbs_avion)})`
                  : " + lo volado desde el último ajuste"}
                . Si lo trasladas a otro avión, sus horas viajan con él y siguen
                sumando sin perderse.
              </p>
            </div>
          )}

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
            <Field
              label="Horas totales"
              hint="tiempo total del componente (TSN)"
              error={errors.horas_totales?.message}
            >
              <Input type="number" step="0.01" min={0} {...register("horas_totales")} />
            </Field>
            <Field
              label="TURM"
              hint="horas del componente en su último overhaul"
              error={errors.turm_componente?.message}
            >
              <Input type="number" step="0.01" min={0} {...register("turm_componente")} />
            </Field>
            <Field label="TBO" required hint="horas" error={errors.tbo_horas?.message}>
              <Input type="number" step="0.01" min={1} placeholder="1700" {...register("tbo_horas")} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Estos campos son la FOTO de la bitácora al día del ajuste — no se quedan fijos: desde
            ahí el sistema sigue sumando solo con el tacómetro de cada vuelo. T.T. = horas totales
            y T.U.R.M. del componente, como en la bitácora física (sin overhaul, deja TURM vacío).
            Toca las horas SOLO para corregir la base.
          </p>
          <Field
            label="Vence overhaul (fecha)"
            hint="Opcional: límite calendario del TBO (ej. 12 años desde el overhaul). Manda lo que ocurra primero."
            error={errors.tbo_fecha?.message}
          >
            <Input type="date" {...register("tbo_fecha")} />
          </Field>
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
      turm_componente: "",
      tbo_horas: "" as unknown as number,
      tbo_fecha: "",
      notas: "",
    };
  }
  return {
    posicion: m.posicion,
    numero_serie: m.numero_serie,
    tipo: m.tipo,
    fabricante: m.fabricante ?? "",
    modelo: m.modelo ?? "",
    horas_totales: m.horas_totales ?? "",
    // Prellena el TURM en marco del componente (derivado del snapshot). Solo
    // se manda si el usuario lo cambia (defensa dirty-fields de arriba).
    turm_componente: m.turm_componente ?? "",
    tbo_horas: m.tbo_horas as unknown as number,
    tbo_fecha: m.tbo_fecha ?? "",
    notas: m.notas ?? "",
  };
}
