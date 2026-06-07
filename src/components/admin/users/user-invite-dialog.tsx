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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createUserAction } from "@/app/admin/users/actions";
import { UserInviteSchema, type UserInviteValues } from "@/app/admin/users/schema";

const ROLES = [
  { value: "ADMIN", label: "ADMIN", description: "Acceso total" },
  { value: "COORDINADOR", label: "COORDINADOR", description: "Solicitudes y cotizaciones" },
  { value: "ANALISTA", label: "ANALISTA", description: "Costos por avión" },
  { value: "FACTURACION", label: "FACTURACION", description: "CFDI y caja chica" },
  { value: "PILOTO", label: "PILOTO", description: "Operativos: app móvil" },
  { value: "SOCIO", label: "SOCIO", description: "Lectura + PDFs de reparto" },
  { value: "MECANICO", label: "MECÁNICO", description: "App: combustible e inventario" },
];

const ESTADOS = [
  { value: "ACTIVO", label: "ACTIVO", description: "Puede entrar y usar el sistema" },
  { value: "INVITADO", label: "INVITADO", description: "Placeholder; actívalo para darle acceso" },
];

export function UserInviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserInviteValues>({
    resolver: zodResolver(UserInviteSchema),
    defaultValues: { nombre: "", email: "", rol: "PILOTO", estado: "ACTIVO" },
  });

  useEffect(() => {
    if (open) reset({ nombre: "", email: "", rol: "PILOTO", estado: "ACTIVO" });
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createUserAction(values);
      if (result.ok) {
        toast.success("Usuario invitado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Pre-carga a la persona con el correo exacto que usará para entrar con Google. Solo
            los correos invitados (o de dominio de la empresa) pueden iniciar sesión.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Nombre y apellido" {...register("nombre")} />
          </Field>

          <Field
            label="Correo de Google"
            required
            hint="El email exacto con el que iniciará sesión"
            error={errors.email?.message}
          >
            <Input type="email" placeholder="persona@gmail.com" {...register("email")} className="font-mono" />
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
                value={(watch("estado") as string | undefined) ?? "ACTIVO"}
                onChange={(v) => setValue("estado", v as never)}
                placeholder="Estado"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Invitando…" : "Invitar"}
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
