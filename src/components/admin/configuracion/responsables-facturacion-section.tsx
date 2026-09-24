"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellAlertIcon } from "@heroicons/react/24/outline";
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
import { setResponsablesFacturacionAction } from "@/app/admin/configuracion/actions";
import { unirNombres } from "@/lib/admin/facturas-emitidas";
import type { ResponsablesFacturacion } from "@/types/facturas-emitidas";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "admin",
  COORDINADOR: "coordinación",
  FACTURACION: "facturación",
};

const FUENTE_TEXTO: Record<ResponsablesFacturacion["fuente"], string> = {
  CONFIG: "los elegidos aquí",
  ROL_FACTURACION: "nadie elegido: van los usuarios con rol Facturación",
  ADMINS: "nadie elegido y no hay usuarios de Facturación: van todos los administradores",
};

/**
 * «Responsables de facturación» (24-sep-2026): a quién le llega el aviso
 * «Factura pedida» cuando alguien marca «Necesito factura» en un vuelo.
 * Sembrado con Mary Cruz (Mari factura). Solo ADMIN edita.
 *
 * `datos = null` ⇒ el API todavía no tiene la migración (503): se dice en
 * gris, sin controles que fallarían.
 */
export function ResponsablesFacturacionSection({
  datos,
  fallo = false,
}: {
  datos: ResponsablesFacturacion | null;
  /** `datos = null` porque la carga FALLÓ (no por falta de la migración). */
  fallo?: boolean;
}) {
  const router = useRouter();
  const baseId = useId();
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(datos?.usuario_ids ?? []),
  );
  const [pendiente, startTransition] = useTransition();

  if (!datos) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BellAlertIcon className="h-4 w-4 text-muted-foreground" />
            Responsables de facturación
          </CardTitle>
          <CardDescription className="text-xs">
            {fallo
              ? "No se pudo cargar quién recibe el aviso. Recarga la página para reintentar."
              : "Disponible cuando se habilite el registro de facturas emitidas."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const guardados = new Set(datos.usuario_ids);
  // Solo viajan los CANDIDATOS (usuarios activos de oficina): un responsable
  // guardado que se dio de baja no tiene switch en pantalla y, si se
  // reenviara, el API respondería 400 USUARIOS_INVALIDOS en CADA guardado —
  // sin forma de quitarlo desde aquí.
  const candidatosIds = new Set(datos.candidatos.map((c) => c.id));
  const aGuardar = [...elegidos].filter((id) => candidatosIds.has(id));
  const cambio =
    aGuardar.length !== guardados.size || aGuardar.some((id) => !guardados.has(id));
  // Usuarios guardados que ya no son candidatos (inactivos o de otro rol).
  const fueraDeLista = datos.usuario_ids
    .filter((id) => !candidatosIds.has(id))
    .map((id) => datos.usuarios.find((u) => u.id === id)?.nombre ?? "un usuario dado de baja");

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
      const res = await setResponsablesFacturacionAction(aGuardar);
      if (res.ok && res.data) {
        const quienes = unirNombres(res.data.efectivos.map((e) => e.nombre));
        toast.success(
          quienes
            ? `Guardado. El aviso le llegará a ${quienes}.`
            : "Guardado.",
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar.");
      }
    });
  };

  const efectivos = unirNombres(datos.efectivos.map((e) => e.nombre));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <BellAlertIcon className="h-4 w-4 text-muted-foreground" />
          Responsables de facturación
        </CardTitle>
        <CardDescription className="text-xs">
          Quién recibe el aviso cuando alguien pide factura de un vuelo. Si no eliges a nadie, el
          aviso llega a los usuarios con rol Facturación y, si no hay, a todos los administradores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {datos.candidatos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay usuarios activos de oficina (administración, coordinación o facturación).
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {datos.candidatos.map((u) => {
              const id = `${baseId}-${u.id}`;
              return (
                <li key={u.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <Switch
                    id={id}
                    checked={elegidos.has(u.id)}
                    onCheckedChange={(v) => alternar(u.id, v === true)}
                    disabled={pendiente}
                  />
                  <Label htmlFor={id} className="flex-1 text-sm font-normal">
                    {u.nombre}
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      · {ROL_LABEL[u.rol] ?? u.rol.toLowerCase()}
                    </span>
                  </Label>
                </li>
              );
            })}
          </ul>
        )}

        {fueraDeLista.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Guardados pero ya no reciben avisos (inactivos o sin rol de oficina):{" "}
            {unirNombres(fueraDeLista)}. Pulsa «Guardar» para quitarlos de la lista.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {efectivos ? (
              <>
                Hoy el aviso le llega a: <span className="font-medium text-foreground">{efectivos}</span>.
              </>
            ) : (
              "Hoy el aviso no le llega a nadie."
            )}{" "}
            <span className="text-[11px]">({FUENTE_TEXTO[datos.fuente]})</span>
          </p>
          <Button size="sm" onClick={guardar} disabled={!cambio || pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
