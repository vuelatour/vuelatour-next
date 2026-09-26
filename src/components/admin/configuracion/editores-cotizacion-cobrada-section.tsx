"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/outline";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setEditoresCotizacionCobradaAction } from "@/app/admin/configuracion/actions";
import {
  diffEditores,
  errorEditoresPideRecargar,
  mensajeErrorEditores,
  nombresEditores,
  textoConfirmarEditores,
  type EditoresCotizacionCobrada,
} from "@/lib/admin/cotizacion-cobrada";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "admin",
  COORDINADOR: "coordinación",
  FACTURACION: "facturación",
};

/** Usuario que puede recibir el permiso (oficina activa que guarda cotizaciones). */
export interface CandidatoEditor {
  id: string;
  nombre: string;
  rol?: string;
}

const TITULO = "Editan cotizaciones cobradas";
const DESCRIPCION =
  "Quién puede corregir una cotización que ya tiene cobros (por ejemplo, quitarle el IVA a un vuelo que se pagó en efectivo). Los cobros no se modifican: al guardar, el saldo se recalcula con ellos. A los demás la cotización les aparece bloqueada con el nombre de quién puede editarla.";

/**
 * «Editan cotizaciones cobradas» (26-sep-2026, API 0.0.37): el permiso POR
 * PERSONA que pidieron los dueños — «que se desbloquee para mí, no para
 * todos». Sembrado con Alejandro y Pablo Canales. Todos los de oficina son
 * ADMIN, por eso no es un rol.
 *
 * - `puede_modificar` (lo decide el API: estar en la lista) ⇒ switches +
 *   «Guardar» con confirmación (quitar a alguien es quitarle un permiso). La
 *   lista NUNCA queda vacía: el último switch encendido no se apaga.
 * - Sin `puede_modificar` ⇒ solo lectura: quién puede editarlas y por qué no
 *   se puede cambiar desde aquí.
 * - `datos = null` ⇒ API previo (`noDisponible`) o carga fallida (`fallo`):
 *   se dice en gris, sin controles que fallarían.
 */
export function EditoresCotizacionCobradaSection({
  datos,
  candidatos,
  meId,
  fallo = false,
}: {
  datos: EditoresCotizacionCobrada | null;
  /** Oficina activa que puede guardar cotizaciones (ADMIN/COORDINADOR). */
  candidatos: CandidatoEditor[];
  /** Usuario en sesión: quitarse a sí mismo se advierte aparte. */
  meId: string | null;
  /** `datos = null` porque la carga FALLÓ (no porque el API sea previo). */
  fallo?: boolean;
}) {
  const router = useRouter();
  const baseId = useId();
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(datos?.usuario_ids ?? []),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (!datos) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <LockOpenIcon className="h-4 w-4 text-muted-foreground" />
            {TITULO}
          </CardTitle>
          <CardDescription className="text-xs">
            {fallo
              ? "No se pudo cargar quién puede editarlas. Recarga la página para reintentar."
              : "Disponible cuando se actualice el API."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const actuales = nombresEditores(datos);

  if (!datos.puede_modificar) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <LockOpenIcon className="h-4 w-4 text-muted-foreground" />
            {TITULO}
          </CardTitle>
          <CardDescription className="text-xs">{DESCRIPCION}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {actuales.length > 0 ? (
              <>
                Hoy pueden editarlas:{" "}
                <span className="font-medium text-foreground">{actuales.join(", ")}</span>.
              </>
            ) : (
              "Hoy nadie puede editarlas."
            )}
          </p>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <LockClosedIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            Solo quien ya está en la lista puede cambiarla.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Solo viajan CANDIDATOS: un editor guardado que se dio de baja no tiene
  // switch y reenviarlo daría 400 USUARIOS_INVALIDOS en cada guardado.
  const candidatosIds = new Set(candidatos.map((c) => c.id));
  const aGuardar = [...elegidos].filter((id) => candidatosIds.has(id));
  const { agregados, quitados } = diffEditores(datos.usuario_ids, aGuardar);
  const cambio = agregados.length > 0 || quitados.length > 0;
  const fueraDeLista = datos.usuario_ids
    .filter((id) => !candidatosIds.has(id))
    .map((id) => datos.usuarios.find((u) => u.id === id)?.nombre ?? "un usuario dado de baja");
  const nombreDe = (id: string) =>
    candidatos.find((c) => c.id === id)?.nombre ??
    datos.usuarios.find((u) => u.id === id)?.nombre ??
    "un usuario dado de baja";

  const alternar = (id: string, on: boolean) => {
    setElegidos((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const guardar = () => {
    startTransition(async () => {
      const res = await setEditoresCotizacionCobradaAction(aGuardar);
      if (res.ok && res.data) {
        const quienes = nombresEditores(res.data);
        toast.success(
          quienes.length > 0
            ? `Guardado. Pueden editar cotizaciones cobradas: ${quienes.join(", ")}.`
            : "Guardado.",
        );
        setConfirmando(false);
        router.refresh();
      } else {
        setConfirmando(false);
        toast.error(mensajeErrorEditores(res.code, res.error));
        // Otro la cambió, alguien ya no es válido o perdiste el permiso:
        // la sección se repinta con lo que hay hoy en el API.
        if (errorEditoresPideRecargar(res.code)) router.refresh();
      }
    });
  };

  const textoConfirmacion = textoConfirmarEditores({
    agregados: agregados.map(nombreDe),
    quitados: quitados.map(nombreDe),
    meQuito: meId != null && quitados.includes(meId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <LockOpenIcon className="h-4 w-4 text-muted-foreground" />
          {TITULO}
        </CardTitle>
        <CardDescription className="text-xs">{DESCRIPCION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidatos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay usuarios activos de oficina (administración o coordinación).
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {candidatos.map((u) => {
              const id = `${baseId}-${u.id}`;
              const on = elegidos.has(u.id);
              // La lista nunca queda vacía: el último encendido no se apaga.
              const ultimo = on && aGuardar.length === 1;
              return (
                <li
                  key={u.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  title={ultimo ? "La lista no puede quedar vacía." : undefined}
                >
                  <Switch
                    id={id}
                    checked={on}
                    onCheckedChange={(v) => alternar(u.id, v === true)}
                    disabled={pendiente || ultimo}
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
                    {u.nombre}
                    {u.rol && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        · {ROL_LABEL[u.rol] ?? u.rol.toLowerCase()}
                      </span>
                    )}
                    {u.id === meId && (
                      <span className="ml-1 text-[11px] text-muted-foreground">(tú)</span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}

        {fueraDeLista.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Guardados pero ya no activos en la oficina: {fueraDeLista.join(", ")}. Pulsa
            «Guardar» para quitarlos de la lista.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {actuales.length > 0 ? (
              <>
                Hoy pueden editarlas:{" "}
                <span className="font-medium text-foreground">{actuales.join(", ")}</span>.
              </>
            ) : (
              "Hoy nadie puede editarlas."
            )}
          </p>
          <Button
            size="sm"
            onClick={() => setConfirmando(true)}
            disabled={!cambio || pendiente || aGuardar.length === 0}
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={(o) => !pendiente && setConfirmando(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar quién edita cotizaciones cobradas?</AlertDialogTitle>
            <AlertDialogDescription>{textoConfirmacion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                guardar();
              }}
              disabled={pendiente}
            >
              {pendiente ? "Guardando…" : "Sí, guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
