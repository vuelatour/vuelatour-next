"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockClosedIcon, UserGroupIcon } from "@heroicons/react/24/outline";
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
import { setAccesoNominaAction } from "@/app/admin/configuracion/actions";
import { fmtDateTime } from "@/lib/datetime";
import {
  DESCRIPCION_ACCESO_NOMINA,
  TEXTO_ACCESO_FALLO,
  TEXTO_ACCESO_NO_DISPONIBLE,
  TEXTO_ACCESO_SIN_CANDIDATOS,
  TEXTO_ACCESO_SOLO_DIRECCION,
  TITULO_ACCESO_NOMINA,
  TITULO_CONFIRMAR_ACCESO_NOMINA,
  conAccesoHoy,
  diffAccesoNomina,
  errorAccesoNominaPideRecargar,
  guardadosFueraDeLista,
  idsAGuardarAcceso,
  mensajeErrorAccesoNomina,
  nombreDeAcceso,
  textoAccesoActual,
  textoConfirmarAccesoNomina,
  textoEntranPorRol,
  textoFueraDeLista,
  textoGuardadoAccesoNomina,
  textoUltimoCambioAcceso,
  type AccesoNomina,
} from "@/lib/admin/acceso-nomina";

function Encabezado({ descripcion }: { descripcion: string }) {
  return (
    <CardHeader>
      <CardTitle className="text-sm flex items-center gap-2">
        <UserGroupIcon className="h-4 w-4 text-muted-foreground" />
        {TITULO_ACCESO_NOMINA}
      </CardTitle>
      <CardDescription className="text-xs">{descripcion}</CardDescription>
    </CardHeader>
  );
}

/**
 * «Acceso a Nómina» (12-nov-2026, API 0.0.137, invariante 132 del API).
 * Pedido de Dirección: «poder habilitar o deshabilitar a algunos usuarios el
 * módulo de nómina … mejor poder controlarlo desde configuración». Un switch
 * por persona de Administración; Dirección, Coordinación y Facturación ya
 * entran por su rol y no se apagan aquí.
 *
 * - `puede_modificar` (lo decide el API: ser de Dirección) ⇒ switches +
 *   «Guardar» con confirmación (dar o quitar la entrada a los sueldos se
 *   confirma con nombre). La lista puede quedar vacía.
 * - Sin `puede_modificar` (Administración) ⇒ solo lectura: quién entra y que
 *   solo Dirección lo cambia.
 * - `datos = null` ⇒ API previo o carga fallida (`fallo`): se dice en gris,
 *   sin controles que fallarían.
 *
 * Textos y reglas: `lib/admin/acceso-nomina.ts` (PURO). La página le pone
 * `key` = sello + lista guardada: si otro de Dirección la cambia, la sección
 * arranca de lo que hay hoy (y el API rechaza con 409 un guardado hecho desde
 * una pantalla vieja).
 */
export function AccesoNominaSection({
  datos,
  fallo = false,
}: {
  datos: AccesoNomina | null;
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
        <Encabezado descripcion={fallo ? TEXTO_ACCESO_FALLO : TEXTO_ACCESO_NO_DISPONIBLE} />
      </Card>
    );
  }

  const porRol = textoEntranPorRol(datos.por_rol);
  const actuales = conAccesoHoy(datos);
  const ultimoCambio = textoUltimoCambioAcceso(
    datos.actualizado_at ? fmtDateTime(datos.actualizado_at) : null,
    datos.actualizado_por_nombre,
  );

  if (!datos.puede_modificar) {
    return (
      <Card>
        <Encabezado descripcion={DESCRIPCION_ACCESO_NOMINA} />
        <CardContent className="space-y-2">
          {porRol && <p className="text-xs text-muted-foreground">{porRol}</p>}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{textoAccesoActual(actuales)}</span>
          </p>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <LockClosedIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {TEXTO_ACCESO_SOLO_DIRECCION}
          </p>
        </CardContent>
      </Card>
    );
  }

  const aGuardar = idsAGuardarAcceso(elegidos, datos.candidatos);
  const { agregados, quitados, cambio } = diffAccesoNomina(datos.usuario_ids, aGuardar);
  const fueraDeLista = guardadosFueraDeLista(datos);

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
      // `version` = el sello que trajo esta pantalla: si otro de Dirección
      // cambió la lista después, el API responde 409 en vez de pisarla.
      const res = await setAccesoNominaAction(aGuardar, datos.version ?? null);
      setConfirmando(false);
      if (res.ok && res.data) {
        toast.success(textoGuardadoAccesoNomina(conAccesoHoy(res.data)));
        router.refresh();
        return;
      }
      toast.error(mensajeErrorAccesoNomina(res));
      // Otro la cambió, alguien ya no es válido o ya no eres de Dirección:
      // la sección se repinta con lo que hay hoy en el API.
      if (errorAccesoNominaPideRecargar(res)) router.refresh();
    });
  };

  const textoConfirmacion = textoConfirmarAccesoNomina({
    agregados: agregados.map((id) => nombreDeAcceso(datos, id)),
    quitados: quitados.map((id) => nombreDeAcceso(datos, id)),
  });

  return (
    <Card>
      <Encabezado descripcion={DESCRIPCION_ACCESO_NOMINA} />
      <CardContent className="space-y-3">
        {porRol && <p className="text-xs text-muted-foreground">{porRol}</p>}

        {datos.candidatos.length === 0 ? (
          <p className="text-xs text-muted-foreground">{TEXTO_ACCESO_SIN_CANDIDATOS}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {datos.candidatos.map((u) => {
              const id = `${baseId}-${u.id}`;
              return (
                <li
                  key={u.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <Switch
                    id={id}
                    checked={elegidos.has(u.id)}
                    onCheckedChange={(v) => alternar(u.id, v === true)}
                    disabled={pendiente}
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
                    {u.nombre}
                    <span className="ml-1 text-[11px] text-muted-foreground">· administración</span>
                  </Label>
                </li>
              );
            })}
          </ul>
        )}

        {fueraDeLista.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {textoFueraDeLista(fueraDeLista)}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{textoAccesoActual(actuales)}</span>
            </p>
            {ultimoCambio && (
              <p className="text-[11px] text-muted-foreground">{ultimoCambio}</p>
            )}
          </div>
          <Button size="sm" onClick={() => setConfirmando(true)} disabled={!cambio || pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={(o) => !pendiente && setConfirmando(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TITULO_CONFIRMAR_ACCESO_NOMINA}</AlertDialogTitle>
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
