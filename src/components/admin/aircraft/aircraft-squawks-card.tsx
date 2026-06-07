"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ClipboardDocumentListIcon,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createSquawkAction,
  deleteSquawkAction,
  updateSquawkAction,
} from "@/app/admin/aircraft/actions";
import { SquawkFormSchema, type SquawkFormValues } from "@/app/admin/aircraft/schema";
import type {
  AeronaveDiscrepancia,
  EstadoSquawk,
  SeveridadSquawk,
} from "@/types/aircraft";

const SEVERIDAD: Record<SeveridadSquawk, { label: string; cls: string }> = {
  BAJA: { label: "Baja", cls: "" },
  MEDIA: { label: "Media", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  ALTA: { label: "Alta", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const ESTADO: Record<EstadoSquawk, { label: string; cls: string }> = {
  ABIERTA: { label: "Abierta", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  EN_PROGRESO: { label: "En progreso", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  RESUELTA: { label: "Resuelta", cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function AircraftSquawksCard({
  aircraftId,
  discrepancias,
}: {
  aircraftId: string;
  discrepancias: AeronaveDiscrepancia[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AeronaveDiscrepancia | undefined>(undefined);
  const [deleting, setDeleting] = useState<AeronaveDiscrepancia | null>(null);
  const [pending, startTransition] = useTransition();

  const abiertas = discrepancias.filter((d) => d.estado !== "RESUELTA").length;

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      const res = await deleteSquawkAction(aircraftId, id);
      if (res.ok) {
        toast.success("Discrepancia eliminada");
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
            <ClipboardDocumentListIcon className="h-4 w-4 text-muted-foreground" />
            Bitácora de discrepancias
          </CardTitle>
          <CardDescription>
            {discrepancias.length} registradas
            {abiertas > 0 && (
              <span className="text-destructive"> · {abiertas} sin resolver</span>
            )}
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
          Reportar
        </Button>
      </CardHeader>
      <CardContent>
        {discrepancias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin discrepancias registradas.</p>
        ) : (
          <div className="space-y-2">
            {discrepancias.map((d) => (
              <div
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.descripcion}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Reportada {fmtDate(d.fecha_reporte)}
                    {d.estado === "RESUELTA" && d.fecha_resolucion
                      ? ` · Resuelta ${fmtDate(d.fecha_resolucion)}`
                      : ""}
                  </p>
                  {d.estado === "RESUELTA" && d.resolucion && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">↳ {d.resolucion}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className={SEVERIDAD[d.severidad].cls}>
                    {SEVERIDAD[d.severidad].label}
                  </Badge>
                  <Badge variant="outline" className={ESTADO[d.estado].cls}>
                    {ESTADO[d.estado].label}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditing(d);
                      setDialogOpen(true);
                    }}
                    title="Editar / resolver"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleting(d)}
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
        <SquawkDialog
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
            <AlertDialogTitle>¿Eliminar esta discrepancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el registro de la bitácora. Esta acción no se puede
              deshacer.
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

function SquawkDialog({
  open,
  onOpenChange,
  aircraftId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  initial?: AeronaveDiscrepancia;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SquawkFormValues>({
    resolver: zodResolver(SquawkFormSchema),
    defaultValues: defaults(initial),
  });

  const estado = watch("estado");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = isEdit
        ? await updateSquawkAction(aircraftId, initial!.id, values)
        : await createSquawkAction(aircraftId, values);
      if (res.ok) {
        toast.success(isEdit ? "Discrepancia actualizada" : "Discrepancia reportada");
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
          <DialogTitle>{isEdit ? "Editar discrepancia" : "Reportar discrepancia"}</DialogTitle>
          <DialogDescription>Falla o anomalía detectada en la aeronave.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Descripción" required error={errors.descripcion?.message}>
            <Textarea rows={2} placeholder="Ej. Luz de presión de aceite intermitente" {...register("descripcion")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severidad" required error={errors.severidad?.message}>
              <SearchableSelect
                options={[
                  { value: "BAJA", label: "Baja" },
                  { value: "MEDIA", label: "Media" },
                  { value: "ALTA", label: "Alta" },
                ]}
                value={(watch("severidad") as string | undefined) ?? "MEDIA"}
                onChange={(v) => setValue("severidad", v as never)}
                placeholder="Severidad"
              />
            </Field>
            <Field label="Estado" required error={errors.estado?.message}>
              <SearchableSelect
                options={[
                  { value: "ABIERTA", label: "Abierta" },
                  { value: "EN_PROGRESO", label: "En progreso" },
                  { value: "RESUELTA", label: "Resuelta" },
                ]}
                value={(watch("estado") as string | undefined) ?? "ABIERTA"}
                onChange={(v) => setValue("estado", v as never)}
                placeholder="Estado"
              />
            </Field>
          </div>
          <Field label="Fecha de reporte" error={errors.fecha_reporte?.message}>
            <Input type="date" {...register("fecha_reporte")} />
          </Field>
          {estado === "RESUELTA" && (
            <>
              <Field label="Resolución" error={errors.resolucion?.message}>
                <Textarea rows={2} placeholder="Cómo se resolvió" {...register("resolucion")} />
              </Field>
              <Field label="Fecha de resolución" error={errors.fecha_resolucion?.message}>
                <Input type="date" {...register("fecha_resolucion")} />
              </Field>
            </>
          )}
          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Reportar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function defaults(d?: AeronaveDiscrepancia): SquawkFormValues {
  if (!d) {
    return {
      descripcion: "",
      severidad: "MEDIA",
      estado: "ABIERTA",
      fecha_reporte: "",
      resolucion: "",
      fecha_resolucion: "",
      notas: "",
    };
  }
  return {
    descripcion: d.descripcion,
    severidad: d.severidad,
    estado: d.estado,
    fecha_reporte: d.fecha_reporte ?? "",
    resolucion: d.resolucion ?? "",
    fecha_resolucion: d.fecha_resolucion ?? "",
    notas: d.notas ?? "",
  };
}
