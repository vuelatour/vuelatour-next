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
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateUserAction } from "@/app/admin/users/actions";
import { UserFormSchema, type UserFormValues } from "@/app/admin/users/schema";
import type { User } from "@/types/users";
import { Field } from "@/components/admin/form-field";

const ROLES = [
  { value: "ADMIN", label: "ADMIN", description: "Acceso total" },
  { value: "COORDINADOR", label: "COORDINADOR", description: "Itzel: solicitudes y cotizaciones" },
  { value: "ANALISTA", label: "ANALISTA", description: "Jimmy: costos por avión" },
  { value: "FACTURACION", label: "FACTURACION", description: "Mary: CFDI y caja chica" },
  { value: "PILOTO", label: "PILOTO", description: "Operativos: app móvil" },
  { value: "SOCIO", label: "SOCIO", description: "Lectura + PDFs de reparto" },
  { value: "MECANICO", label: "MECÁNICO", description: "Luis: app, solo cargas de combustible" },
];

const ESTADOS = [
  { value: "ACTIVO", label: "ACTIVO", description: "Puede usar el sistema" },
  { value: "INVITADO", label: "INVITADO", description: "Pendiente de activación" },
  { value: "INACTIVO", label: "INACTIVO", description: "Bloqueado" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(UserFormSchema),
    defaultValues: defaults(user),
  });

  useEffect(() => {
    if (open) reset(defaults(user));
  }, [open, user, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateUserAction(user.id, values);
      if (result.ok) {
        toast.success("Usuario actualizado");
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
          <DialogTitle>Editar {user.nombre}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{user.email}</span> · Asigna rol y activa al usuario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rol" required error={errors.rol?.message}>
              <SearchableSelect
                options={ROLES}
                value={(watch("rol") as string | undefined) ?? "PILOTO"}
                onChange={(v) => setValue("rol", v as never)}
                placeholder="Rol"
              />
            </Field>
            <Field label="Estado" required error={errors.estado?.message}>
              <SearchableSelect
                options={ESTADOS}
                value={(watch("estado") as string | undefined) ?? "INVITADO"}
                onChange={(v) => setValue("estado", v as never)}
                placeholder="Estado"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" error={errors.telefono?.message}>
              <Input {...register("telefono")} />
            </Field>
            <Field
              label="Terminación tarjeta corp."
              hint="4 dígitos"
              error={errors.tarjeta_terminacion?.message}
            >
              <Input
                maxLength={4}
                {...register("tarjeta_terminacion")}
                className="font-mono"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Fondo de caja chica</Label>
              <p className="text-xs text-muted-foreground">
                Marca si tiene asignado fondo administrado por Mary.
              </p>
            </div>
            <Switch
              checked={watch("tiene_fondo_caja") ?? false}
              onCheckedChange={(c) => setValue("tiene_fondo_caja", c)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">También es piloto</Label>
              <p className="text-xs text-muted-foreground">
                Doble rol (ej. admin que vuela): aparece en los selectores de
                piloto, disponibilidad y horas. Sus permisos siguen siendo los
                del rol principal.
              </p>
            </div>
            <Switch
              checked={watch("es_piloto") ?? false}
              onCheckedChange={(c) => setValue("es_piloto", c)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Piloto externo</Label>
              <p className="text-xs text-muted-foreground">
                Marcar si no tiene app móvil (Itzel sube sus tacómetros).
              </p>
            </div>
            <Switch
              checked={watch("es_piloto_externo") ?? false}
              onCheckedChange={(c) => setValue("es_piloto_externo", c)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(user: User): UserFormValues {
  return {
    nombre: user.nombre,
    rol: user.rol,
    estado: user.estado,
    tiene_fondo_caja: user.tiene_fondo_caja,
    tarjeta_terminacion: user.tarjeta_terminacion ?? "",
    es_piloto: user.es_piloto,
    es_piloto_externo: user.es_piloto_externo,
    telefono: user.telefono ?? "",
    avatar_url: user.avatar_url ?? "",
  };
}
