"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  PlusIcon,
  PencilSquareIcon,
  XMarkIcon,
  UsersIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  closeOwnerAction,
  createOwnerAction,
  updateOwnerAction,
} from "@/app/admin/aircraft/actions";
import { OwnerFormSchema, type OwnerFormValues } from "@/app/admin/aircraft/schema";
import { fmtPercent } from "@/lib/format";
import type { AircraftOwner } from "@/types/aircraft";

export interface SocioOption {
  id: string;
  nombre: string;
}

interface Props {
  aircraftId: string;
  owners: AircraftOwner[];
  socios: SocioOption[];
}

export function AircraftOwnersCard({ aircraftId, owners, socios }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AircraftOwner | undefined>(undefined);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = owners.reduce((sum, o) => sum + Number(o.porcentaje), 0);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (o: AircraftOwner) => {
    setEditing(o);
    setDialogOpen(true);
  };

  const closeOwner = (o: AircraftOwner) => {
    setClosingId(o.id);
    startTransition(async () => {
      const res = await closeOwnerAction(aircraftId, o.id);
      if (res.ok) toast.success("Régimen cerrado");
      else toast.error(res.error ?? "No se pudo cerrar");
      setClosingId(null);
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            Propietarios actuales
          </CardTitle>
          <CardDescription>
            {owners.length} {owners.length === 1 ? "propietario" : "propietarios"} ·{" "}
            <span className={Math.abs(total - 100) > 0.01 ? "text-amber-600 dark:text-amber-400" : ""}>
              {fmtPercent(total)} asignado
            </span>
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openCreate}>
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin propietarios registrados.</p>
        ) : (
          owners.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{o.usuario?.nombre ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {o.usuario?.es_empresa ? "Empresa" : o.usuario?.rol ?? "Socio"} · desde{" "}
                  {o.vigente_desde}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 font-mono">
                  {fmtPercent(o.porcentaje)}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openEdit(o)}
                  title="Editar"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => closeOwner(o)}
                  disabled={pending && closingId === o.id}
                  title="Cerrar régimen (vigente_hasta = hoy)"
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <OwnerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        aircraftId={aircraftId}
        socios={socios}
        initialOwner={editing}
      />
    </Card>
  );
}

function OwnerDialog({
  open,
  onOpenChange,
  aircraftId,
  socios,
  initialOwner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  socios: SocioOption[];
  initialOwner?: AircraftOwner;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialOwner;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OwnerFormValues>({
    resolver: zodResolver(OwnerFormSchema),
    defaultValues: defaults(initialOwner),
  });

  useEffect(() => {
    if (open) reset(defaults(initialOwner));
  }, [open, initialOwner, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = isEdit
        ? await updateOwnerAction(aircraftId, initialOwner!.id, values)
        : await createOwnerAction(aircraftId, values);
      if (res.ok) {
        toast.success(isEdit ? "Propietario actualizado" : "Propietario agregado");
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
          <DialogTitle>{isEdit ? "Editar propietario" : "Agregar propietario"}</DialogTitle>
          <DialogDescription>
            Participación accionaria del avión. La suma de los vigentes debería dar 100%.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Socio" required error={errors.socio_id?.message}>
            <SearchableSelect
              options={socios.map((s) => ({ value: s.id, label: s.nombre }))}
              value={(watch("socio_id") as string | undefined) ?? ""}
              onChange={(v) => setValue("socio_id", v)}
              placeholder="Selecciona un socio"
            />
          </Field>
          <Field label="Porcentaje" required hint="0 a 100" error={errors.porcentaje?.message}>
            <Input type="number" step="0.001" min={0} max={100} placeholder="70" {...register("porcentaje")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vigente desde" required error={errors.vigente_desde?.message}>
              <Input type="date" {...register("vigente_desde")} />
            </Field>
            <Field label="Vigente hasta" hint="vacío = abierto" error={errors.vigente_hasta?.message}>
              <Input type="date" {...register("vigente_hasta")} />
            </Field>
          </div>
          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Ej. Temporal hasta recuperar inversión" {...register("notas")} />
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

function defaults(o?: AircraftOwner): OwnerFormValues {
  if (!o) {
    return {
      socio_id: "",
      porcentaje: "" as unknown as number,
      vigente_desde: "",
      vigente_hasta: "",
      notas: "",
    };
  }
  return {
    socio_id: o.socio_id,
    porcentaje: o.porcentaje as unknown as number,
    vigente_desde: o.vigente_desde ?? "",
    vigente_hasta: o.vigente_hasta ?? "",
    notas: o.notas ?? "",
  };
}
