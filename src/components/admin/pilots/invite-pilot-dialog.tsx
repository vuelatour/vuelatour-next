"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon } from "@heroicons/react/24/outline";
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
import { PhoneField } from "@/components/admin/phone-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invitePilotAction } from "@/app/admin/pilots/actions";
import { InvitePilotSchema, type InvitePilotValues } from "@/app/admin/pilots/schema";
import { Field } from "@/components/admin/form-field";

export function InvitePilotDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<InvitePilotValues>({
    resolver: zodResolver(InvitePilotSchema),
    defaultValues: {
      nombre: "",
      email: "",
      telefono: "",
      tarjeta_terminacion: "",
      es_piloto_externo: false,
      tiene_fondo_caja: false,
    },
  });

  const esExterno = watch("es_piloto_externo") ?? false;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await invitePilotAction(values);
      if (result.ok) {
        toast.success(
          values.es_piloto_externo
            ? "Piloto externo registrado. Ya puedes asignarle vuelos; la oficina captura sus tacómetros y gastos."
            : "Piloto invitado. Ya puede iniciar sesión con Google.",
        );
        reset();
        setOpen(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "Error al invitar");
      }
    });
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="h-4 w-4 mr-1.5" />
        Invitar piloto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{esExterno ? "Registrar piloto externo" : "Invitar piloto"}</DialogTitle>
          <DialogDescription>
            {esExterno ? (
              <>
                Freelance sin acceso al sistema: queda ACTIVO al instante para asignarle
                vuelos. Sus tacómetros y gastos los captura la oficina desde el admin.
              </>
            ) : (
              <>
                Crea el registro del piloto antes de que se loguee por primera vez. Queda en estado
                <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 text-xs">
                  INVITADO
                </span>
                hasta que ingrese con Google y un admin lo active.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre completo" required error={errors.nombre?.message}>
            <Input {...register("nombre")} placeholder="Ej. Marco Pérez" />
          </Field>

          <Field
            label="Correo electrónico"
            required={!esExterno}
            hint={
              esExterno
                ? "Opcional, solo contacto: NO le da acceso al sistema"
                : "Debe coincidir con su cuenta de Google"
            }
            error={errors.email?.message}
          >
            <Input
              type="email"
              autoCapitalize="off"
              autoCorrect="off"
              {...register("email")}
              placeholder={esExterno ? "Opcional" : "piloto@vuelatour.com"}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" error={errors.telefono?.message}>
              <PhoneField
                value={watch("telefono")}
                onChange={(v) => setValue("telefono", v, { shouldValidate: true, shouldDirty: true })}
              />
            </Field>
            {!esExterno && (
              <Field
                label="Terminación tarjeta"
                hint="4 dígitos"
                error={errors.tarjeta_terminacion?.message}
              >
                <Input
                  maxLength={4}
                  {...register("tarjeta_terminacion")}
                  className="font-mono"
                  placeholder="1234"
                />
              </Field>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Piloto externo</Label>
              <p className="text-xs text-muted-foreground">
                Freelance sin usuario ni app: la oficina captura sus tacómetros y gastos.
              </p>
            </div>
            <Switch
              checked={esExterno}
              onCheckedChange={(c) => {
                setValue("es_piloto_externo", c);
                // El requisito de email depende del modo: limpiar el error viejo.
                if (c) clearErrors("email");
              }}
            />
          </div>

          {/* El fondo de caja chica se abre en Tesorería → Caja chica, no se
              marca aquí: marcarlo a mano escondía a la persona del selector
              de "Abrir fondo" sin que el fondo existiera. */}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Guardando…"
                : esExterno
                  ? "Registrar externo"
                  : "Invitar"}
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

