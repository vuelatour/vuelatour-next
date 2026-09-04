"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import type { SquawkAltaDetails } from "@/types/grupos";

/**
 * Confirmación del candado 409 SQUAWK_ALTA_SIN_RESOLVER al guardar el grupo
 * (mismo patrón en dos pasos que asignar avión a un vuelo): el primer
 * intento va sin bandera; si el API rechaza por un avión con discrepancia
 * ALTA, se confirma AQUÍ por ese avión y se reintenta con
 * `aceptar_discrepancia_alta` en esa posición. El API avisa al mecánico.
 */
export function SquawkGrupoDialog({
  detalle,
  pending = false,
  onCancel,
  onConfirm,
}: {
  /** Detalle del 409; null = cerrado. */
  detalle: SquawkAltaDetails | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lista = (detalle?.discrepancias ?? []).map((d) => d.descripcion).filter(Boolean);
  return (
    <AlertDialog open={detalle !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
            {detalle ? `${detalle.matricula} (avión ${detalle.posicion})` : "Avión"} tiene
            discrepancia(s) ALTA sin resolver
          </AlertDialogTitle>
          <AlertDialogDescription>
            El mecánico reportó fallas de severidad ALTA que siguen abiertas en esta
            matrícula:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {(lista.length > 0 ? lista : ["Discrepancia ALTA abierta"]).map((d) => (
            <li key={d}>• {d}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          ¿Usarlo en el grupo de todas formas? Se notificará al mecánico para que
          valide que el avión puede volar.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-amber-500 text-white hover:bg-amber-500/90"
          >
            {pending ? "Guardando…" : "Usar de todas formas"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
