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
  createPropellerAction,
  deletePropellerAction,
  updatePropellerAction,
} from "@/app/admin/aircraft/actions";
import { PropellerFormSchema, type PropellerFormValues } from "@/app/admin/aircraft/schema";
import type { Propeller } from "@/types/aircraft";
import { Field } from "@/components/admin/form-field";

export function AircraftPropellerButton({
  aircraftId,
  propeller,
}: {
  aircraftId: string;
  propeller?: Propeller;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!propeller;

  return (
    <>
      {isEdit ? (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setOpen(true)}
          title="Editar hélice"
          aria-label="Editar hélice"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar
        </Button>
      )}
      <PropellerDialog open={open} onOpenChange={setOpen} aircraftId={aircraftId} propeller={propeller} />
    </>
  );
}

export function AircraftPropellerDeleteButton({
  aircraftId,
  propeller,
}: {
  aircraftId: string;
  propeller: Propeller;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onDelete = () =>
    startTransition(async () => {
      const res = await deletePropellerAction(aircraftId, propeller.id);
      if (res.ok) {
        toast.success("Hélice eliminada");
        setOpen(false);
      } else {
        toast.error(res.error ?? "No se pudo eliminar la hélice");
      }
    });

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        title="Eliminar hélice"
        aria-label="Eliminar hélice"
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar hélice</DialogTitle>
            <DialogDescription>
              Se eliminará la hélice <span className="font-medium">{propeller.posicion}</span>{" "}
              (serie <span className="font-mono">{propeller.numero_serie}</span>). Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar hélice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PropellerDialog({
  open,
  onOpenChange,
  aircraftId,
  propeller,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  propeller?: Propeller;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!propeller;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<PropellerFormValues>({
    resolver: zodResolver(PropellerFormSchema),
    defaultValues: defaults(propeller),
  });

  useEffect(() => {
    if (open) reset(defaults(propeller));
  }, [open, propeller, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // En edición, los campos de horas se mandan SOLO si el usuario los tocó:
      // reenviar `horas_totales` sin cambios re-ancla la referencia del Hobbs
      // en el API y borra las horas vivas acumuladas de la hélice.
      let payload: Partial<PropellerFormValues> = values;
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
        ? await updatePropellerAction(aircraftId, propeller!.id, payload)
        : await createPropellerAction(aircraftId, values);
      if (res.ok) {
        toast.success(isEdit ? "Hélice actualizada" : "Hélice agregada");
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
          <DialogTitle>{isEdit ? "Editar hélice" : "Agregar hélice"}</DialogTitle>
          <DialogDescription>
            La hélice es una entidad propia: sus horas suben solas con cada vuelo y viajan con
            ella si se traslada a otro avión.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {isEdit && propeller?.horas_actuales != null && (
            /* La duda #1 de la oficina: "¿estos números se quedan fijos?" —
               NO: aquí se muestra la vida VIVA (base + volado desde el ancla)
               para que se vea que el sistema suma solo con cada vuelo. */
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs space-y-1">
              <p className="font-medium text-green-700 dark:text-green-400">
                Hoy lleva {fmtDecimal(propeller.horas_actuales)} h de vida — y suben solas con cada
                vuelo.
              </p>
              <p className="text-muted-foreground">
                = {fmtDecimal(Number(propeller.horas_totales))} h de base (la foto de la bitácora)
                {propeller.aeronave_horas_ref != null && propeller.hobbs_avion != null
                  ? ` + lo volado desde el tacómetro ${fmtDecimal(propeller.aeronave_horas_ref)} (el avión va en ${fmtDecimal(propeller.hobbs_avion)})`
                  : " + lo volado desde el último ajuste"}
                . Si la trasladas a otro avión, sus horas viajan con ella y siguen
                sumando sin perderse.
              </p>
            </div>
          )}

          <Field label="Posición" required error={errors.posicion?.message}>
            <SearchableSelect
              options={[
                { value: "UNICA", label: "Única" },
                { value: "IZQUIERDA", label: "Izquierda" },
                { value: "DERECHA", label: "Derecha" },
              ]}
              value={(watch("posicion") as string | undefined) ?? "UNICA"}
              onChange={(v) => setValue("posicion", v as never)}
              placeholder="Posición"
            />
          </Field>
          <Field label="Número de serie" required error={errors.numero_serie?.message}>
            <Input className="font-mono" placeholder="S/N" {...register("numero_serie")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fabricante" error={errors.fabricante?.message}>
              <Input placeholder="Hartzell…" {...register("fabricante")} />
            </Field>
            <Field label="Modelo" error={errors.modelo?.message}>
              <Input {...register("modelo")} />
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
            <Field label="TBO" hint="horas (opcional)" error={errors.tbo_horas?.message}>
              <Input type="number" step="0.01" min={1} {...register("tbo_horas")} />
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
            hint="Opcional: límite calendario del TBO (ej. 6 años desde el overhaul). Manda lo que ocurra primero."
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar hélice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(p?: Propeller): PropellerFormValues {
  if (!p) {
    return {
      posicion: "UNICA",
      numero_serie: "",
      fabricante: "",
      modelo: "",
      horas_totales: "",
      turm_componente: "",
      tbo_horas: "",
      tbo_fecha: "",
      notas: "",
    };
  }
  return {
    posicion: p.posicion,
    numero_serie: p.numero_serie,
    fabricante: p.fabricante ?? "",
    modelo: p.modelo ?? "",
    horas_totales: p.horas_totales ?? "",
    // Prellena el TURM en marco del componente (derivado del snapshot). Solo
    // se manda si el usuario lo cambia (defensa dirty-fields de arriba).
    turm_componente: p.turm_componente ?? "",
    tbo_horas: p.tbo_horas ?? "",
    tbo_fecha: p.tbo_fecha ?? "",
    notas: p.notas ?? "",
  };
}
