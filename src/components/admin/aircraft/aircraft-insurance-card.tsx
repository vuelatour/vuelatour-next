"use client";

import { useState, useTransition } from "react";
import { fmtDateOnly } from "@/lib/datetime";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createInsuranceAction,
  deleteInsuranceAction,
  updateInsuranceAction,
} from "@/app/admin/aircraft/actions";
import { InsuranceFormSchema, type InsuranceFormValues } from "@/app/admin/aircraft/schema";
import { fmtUsd } from "@/lib/format";
import type { AeronaveSeguro } from "@/types/aircraft";
import { Field } from "@/components/admin/form-field";

const fmtDate = fmtDateOnly;

function vigente(hasta: string): boolean {
  const d = new Date(hasta);
  return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now();
}

export function AircraftInsuranceCard({
  aircraftId,
  seguros,
}: {
  aircraftId: string;
  seguros: AeronaveSeguro[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AeronaveSeguro | undefined>(undefined);
  const [deleting, setDeleting] = useState<AeronaveSeguro | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      const res = await deleteInsuranceAction(aircraftId, id);
      if (res.ok) {
        toast.success("Póliza eliminada");
        setDeleting(null);
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    });
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
            Seguros
          </CardTitle>
          <CardDescription>
            {seguros.length} {seguros.length === 1 ? "póliza" : "pólizas"} registradas
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar
        </Button>
      </CardHeader>
      <CardContent>
        {seguros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pólizas registradas.</p>
        ) : (
          <div className="space-y-2">
            {seguros.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.aseguradora} · <span className="font-mono text-xs">{s.num_poliza}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(s.vigente_desde)} – {fmtDate(s.vigente_hasta)}
                    {s.suma_asegurada_usd ? ` · Suma ${fmtUsd(s.suma_asegurada_usd)}` : ""}
                    {s.prima_usd ? ` · Prima ${fmtUsd(s.prima_usd)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {vigente(s.vigente_hasta) ? (
                    <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
                      Vigente
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                      Vencida
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditing(s);
                      setDialogOpen(true);
                    }}
                    title="Editar"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleting(s)}
                    title="Eliminar"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <InsuranceDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={setDialogOpen}
          aircraftId={aircraftId}
          initial={editing}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la póliza {deleting?.num_poliza}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el registro de esta póliza de {deleting?.aseguradora}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function InsuranceDialog({
  open,
  onOpenChange,
  aircraftId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  initial?: AeronaveSeguro;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InsuranceFormValues>({
    resolver: zodResolver(InsuranceFormSchema),
    defaultValues: defaults(initial),
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = isEdit
        ? await updateInsuranceAction(aircraftId, initial!.id, values)
        : await createInsuranceAction(aircraftId, values);
      if (res.ok) {
        toast.success(isEdit ? "Póliza actualizada" : "Póliza agregada");
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar póliza" : "Nueva póliza"}</DialogTitle>
          <DialogDescription>Datos de la póliza de seguro de la aeronave.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aseguradora" required error={errors.aseguradora?.message}>
              <Input placeholder="GNP, AXA…" {...register("aseguradora")} />
            </Field>
            <Field label="No. de póliza" required error={errors.num_poliza?.message}>
              <Input className="font-mono" {...register("num_poliza")} />
            </Field>
          </div>
          <Field label="Cobertura" error={errors.cobertura?.message}>
            <Textarea rows={2} placeholder="Descripción de la cobertura" {...register("cobertura")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Suma asegurada (USD)" error={errors.suma_asegurada_usd?.message}>
              <Input type="number" min={0} step="0.01" {...register("suma_asegurada_usd")} />
            </Field>
            <Field label="Prima (USD)" error={errors.prima_usd?.message}>
              <Input type="number" min={0} step="0.01" {...register("prima_usd")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vigente desde" required error={errors.vigente_desde?.message}>
              <Input type="date" {...register("vigente_desde")} />
            </Field>
            <Field label="Vigente hasta" required error={errors.vigente_hasta?.message}>
              <Input type="date" {...register("vigente_hasta")} />
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(s?: AeronaveSeguro): InsuranceFormValues {
  if (!s) {
    return {
      aseguradora: "",
      num_poliza: "",
      cobertura: "",
      suma_asegurada_usd: "",
      prima_usd: "",
      vigente_desde: "",
      vigente_hasta: "",
      archivo_url: "",
      notas: "",
    };
  }
  return {
    aseguradora: s.aseguradora,
    num_poliza: s.num_poliza,
    cobertura: s.cobertura ?? "",
    suma_asegurada_usd: s.suma_asegurada_usd ?? "",
    prima_usd: s.prima_usd ?? "",
    vigente_desde: s.vigente_desde ?? "",
    vigente_hasta: s.vigente_hasta ?? "",
    archivo_url: s.archivo_url ?? "",
    notas: s.notas ?? "",
  };
}
