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

// Detección del candado: fuente única PURA en `lib/admin/squawk-alta.ts`
// (la comparte el cotizador, que desde el 11-sep-2026 valida el avión al
// revisar). Se re-exporta aquí para no tocar los imports existentes.
export {
  SQUAWK_ALTA_CODE,
  squawkAltaDe,
  type ResultadoFallido,
} from "@/lib/admin/squawk-alta";

/**
 * Confirmación en dos pasos del candado de squawk ALTA (misma mecánica que
 * "recibir sin TC" en compras): el primer intento va SIN bandera; si el API
 * rechaza por discrepancia ALTA, este diálogo ofrece asignar de todas formas
 * (reintento con `aceptar_discrepancia_alta: true` — el API avisa al
 * mecánico para que valide el avión).
 *
 * Los textos del botón y de la pregunta son OPCIONALES: por default hablan
 * de asignar (vuelos) y el cotizador los cambia a «guardar la versión»
 * (11-sep-2026) — mismo diálogo, no una copia.
 */
export function SquawkAltaDialog({
  lista,
  pending = false,
  pregunta,
  confirmLabel,
  pendingLabel,
  onCancel,
  onConfirm,
}: {
  /** Descripciones de las discrepancias ALTA abiertas; null = cerrado. */
  lista: string[] | null;
  pending?: boolean;
  /** Pregunta bajo la lista (default: asignar el avión). */
  pregunta?: string;
  /** Texto del botón de confirmar (default: «Asignar de todas formas»). */
  confirmLabel?: string;
  /** Texto del botón mientras corre (default: «Asignando…»). */
  pendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={lista !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
            El avión tiene discrepancia(s) ALTA sin resolver
          </AlertDialogTitle>
          <AlertDialogDescription>
            El mecánico reportó fallas de severidad ALTA que siguen abiertas en
            esta matrícula:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {(lista ?? []).map((d) => (
            <li key={d}>• {d}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {pregunta ??
            "¿Asignar de todas formas? Se notificará al mecánico para que valide que el avión puede volar."}
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
            {pending
              ? (pendingLabel ?? "Asignando…")
              : (confirmLabel ?? "Asignar de todas formas")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
