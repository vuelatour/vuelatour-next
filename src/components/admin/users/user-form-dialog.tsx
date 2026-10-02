"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
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
import { PhoneField, normalizePhone } from "@/components/admin/phone-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateUserAction, listCardsOptionsAction, type CardOption } from "@/app/admin/users/actions";
import { updatePilotAction } from "@/app/admin/pilots/actions";
import { PilotoDatosSchema, UserFormSchema, type UserFormValues } from "@/app/admin/users/schema";
import type { User } from "@/types/users";
import { Field } from "@/components/admin/form-field";
import {
  APODO_HINT,
  APODO_LABEL,
  APODO_MAX,
  APODO_PLACEHOLDER,
} from "@/lib/admin/usuario-apodo";
import {
  DESCRIPCION_DIALOGO_PILOTO,
  HINT_ES_PILOTO_NO_DISPONIBLE,
  HINT_TARJETA_PILOTO,
  TOAST_PILOTO_ACTUALIZADO,
  opcionesTarjetaPiloto,
  payloadModoPiloto,
  payloadModoUsuario,
  tituloDialogoPiloto,
} from "@/lib/admin/pilotos-edicion";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";

const ROLES = [
  { value: "ADMIN", label: "ADMIN", description: "Acceso total" },
  { value: "COORDINADOR", label: "COORDINADOR", description: "Itzel: solicitudes y cotizaciones" },
  { value: "ANALISTA", label: "ANALISTA", description: "Jimmy: costos por avión" },
  { value: "FACTURACION", label: "FACTURACION", description: "Mary: CFDI y caja chica" },
  { value: "PILOTO", label: "PILOTO", description: "Operativos: app móvil" },
  { value: "SOCIO", label: "SOCIO", description: "Lectura + PDFs de reparto" },
  { value: "MECANICO", label: "MECÁNICO", description: "Luis: app, solo cargas de combustible" },
  { value: "VISITANTE", label: "VISITANTE", description: "Solo gastos de visita desde la app (fondo + tarjeta); sin acceso a vuelos" },
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
  /**
   * `usuario` (default): Usuarios, ADMIN — todo el formulario.
   * `piloto` (2-oct-2026): «Editar datos» en Pilotos — SOLO nombre, nombre
   * corto, teléfono y tarjeta (lo que el API acepta de la coordinación), sin
   * Rol/Estado/switches; guarda por `updatePilotAction`.
   */
  modo?: "usuario" | "piloto";
}

export function UserFormDialog({ open, onOpenChange, user, modo = "usuario" }: Props) {
  const esModoPiloto = modo === "piloto";
  const [pending, startTransition] = useTransition();
  // Tarjetas del catálogo para el selector (26-ago): la terminación ya no es
  // texto libre — elegirla aquí VINCULA la tarjeta real en Tarjetas corp.
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void listCardsOptionsAction().then((res) => {
      if (!cancel && res.ok && res.data) setCardOptions(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    // Modo piloto: el `pick` de los 4 campos (zod descarta lo demás).
    resolver: esModoPiloto
      ? (zodResolver(PilotoDatosSchema) as unknown as Resolver<UserFormValues>)
      : (zodResolver(UserFormSchema) as unknown as Resolver<UserFormValues>),
    defaultValues: defaults(user),
  });

  useEffect(() => {
    if (open) reset(defaults(user));
  }, [open, user, reset]);

  const onSubmit = handleSubmit((values) => {
    // Fuente única del cuerpo (`lib/admin/pilotos-edicion.ts`): tarjeta y
    // apodo SOLO si cambiaron (null = quitar), `tiene_fondo_caja` nunca y
    // las banderas de piloto solo si cambiaron.
    const payload = esModoPiloto
      ? payloadModoPiloto(user, {
          nombre: values.nombre,
          telefono: values.telefono,
          apodo: values.apodo,
          tarjeta_terminacion: values.tarjeta_terminacion,
        })
      : payloadModoUsuario(user, values as Record<string, unknown>);
    startTransition(async () => {
      const result = esModoPiloto
        ? await updatePilotAction(user.id, payload)
        : await updateUserAction(user.id, payload);
      if (result.ok) {
        toast.success(esModoPiloto ? TOAST_PILOTO_ACTUALIZADO : "Usuario actualizado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? (esModoPiloto ? MSG_SERVIDOR_NO_RESPONDIO : "Error desconocido"));
      }
    });
  });

  // Modo piloto: solo tarjetas libres o ya suyas (las de otra persona las
  // reasigna un ADMIN y el API las rechazaría con 403).
  const tarjetasOfrecidas = esModoPiloto ? opcionesTarjetaPiloto(cardOptions, user.id) : cardOptions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {esModoPiloto ? (
            <>
              <DialogTitle>{tituloDialogoPiloto(user.nombre)}</DialogTitle>
              <DialogDescription>{DESCRIPCION_DIALOGO_PILOTO}</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Editar {user.nombre}</DialogTitle>
              <DialogDescription>
                <span className="font-mono">{user.email}</span> · Asigna rol y activa al usuario.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre" required error={errors.nombre?.message}>
              <Input {...register("nombre")} />
            </Field>
            {/* Nombre corto del calendario (17-sep-2026): Luis, el mecánico,
                es el único que sigue leyendo Google Calendar y la oficina
                escribe «Saab», «Zamora», «Pab» — NO el primer nombre. Vacío
                ⇒ el API usa el primer nombre. */}
            <Field label={APODO_LABEL} hint={APODO_HINT} error={errors.apodo?.message}>
              <Input
                {...register("apodo")}
                placeholder={APODO_PLACEHOLDER}
                maxLength={APODO_MAX}
                autoComplete="off"
              />
            </Field>
          </div>

          {!esModoPiloto && (
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" error={errors.telefono?.message}>
              <PhoneField
                value={watch("telefono")}
                onChange={(v) => setValue("telefono", v, { shouldValidate: true, shouldDirty: true })}
              />
            </Field>
            <Field
              label="Tarjeta corp."
              hint={esModoPiloto ? HINT_TARJETA_PILOTO : "del catálogo Tarjetas corp."}
              error={errors.tarjeta_terminacion?.message}
            >
              <SearchableSelect
                options={[
                  { value: "", label: "Sin tarjeta" },
                  ...tarjetasOfrecidas.map((c) => ({
                    value: c.terminacion,
                    label: `**** ${c.terminacion} · ${c.nombre_titular}`,
                  })),
                ]}
                value={watch("tarjeta_terminacion") ?? ""}
                onChange={(v) =>
                  setValue("tarjeta_terminacion", v, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                placeholder="Sin tarjeta"
              />
            </Field>
          </div>

          {/* El fondo de caja chica NO se marca aquí: se abre en Tesorería →
              Caja chica y el sistema mantiene el indicador. Marcarlo a mano
              dejaba a la persona fuera del selector de "Abrir fondo". Tampoco
              viaja en el PATCH (`payloadModoUsuario`). */}

          {!esModoPiloto && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">También es piloto</Label>
                  <p className="text-xs text-muted-foreground">
                    Doble rol (ej. admin que vuela): aparece en los selectores de
                    piloto, disponibilidad y horas. Sus permisos siguen siendo los
                    del rol principal.
                  </p>
                  {/* Servidor sin el dato: no se adivina (un false por omisión le
                      quitaría el doble rol a quien vuela). */}
                  {user.es_piloto === undefined && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {HINT_ES_PILOTO_NO_DISPONIBLE}
                    </p>
                  )}
                </div>
                <Switch
                  checked={watch("es_piloto") ?? false}
                  disabled={user.es_piloto === undefined}
                  onCheckedChange={(c) => setValue("es_piloto", c)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Piloto externo</Label>
                  <p className="text-xs text-muted-foreground">
                    {user.supabase_auth_id && !user.es_piloto_externo
                      ? "No disponible: este usuario ya tiene cuenta con acceso — marcarlo como externo lo bloquearía por completo (el flag es solo para freelance sin usuario)."
                      : "Freelance SIN acceso al sistema (no puede iniciar sesión ni recibe avisos); la oficina captura sus tacómetros y gastos. Al desmarcar, vuelve al flujo normal de invitación."}
                  </p>
                </div>
                <Switch
                  checked={watch("es_piloto_externo") ?? false}
                  disabled={!!user.supabase_auth_id && !user.es_piloto_externo}
                  onCheckedChange={(c) => setValue("es_piloto_externo", c)}
                />
              </div>
            </>
          )}

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
    tarjeta_terminacion: user.tarjeta_terminacion ?? "",
    // API viejo (sin el campo) ⇒ "" y nunca viaja: solo se manda si el
    // capturista lo escribe.
    apodo: user.apodo ?? "",
    es_piloto: user.es_piloto,
    es_piloto_externo: user.es_piloto_externo,
    // Legado normalizado: el form debe validar LO QUE SE MUESTRA.
    telefono: normalizePhone(user.telefono),
    avatar_url: user.avatar_url ?? "",
  };
}
