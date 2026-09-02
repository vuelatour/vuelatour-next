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

/** Código del candado en el API (filtro de excepciones). */
const SQUAWK_ALTA_CODE = "SQUAWK_ALTA_SIN_RESOLVER";

/** Shape mínimo del ActionResult fallido (evita acoplarse a un módulo "use server"). */
interface ResultadoFallido {
  ok: boolean;
  error?: string;
  code?: string;
  details?: unknown;
}

function listaDeDetails(details: unknown): string[] {
  const cruda: unknown[] = Array.isArray(details)
    ? details
    : details &&
        typeof details === "object" &&
        Array.isArray((details as { discrepancias?: unknown }).discrepancias)
      ? (details as { discrepancias: unknown[] }).discrepancias
      : [];
  return cruda
    .map((d) => {
      if (typeof d === "string") return d;
      if (
        d &&
        typeof d === "object" &&
        typeof (d as { descripcion?: unknown }).descripcion === "string"
      ) {
        return (d as { descripcion: string }).descripcion;
      }
      return null;
    })
    .filter((s): s is string => !!s && s.trim().length > 0);
}

/**
 * Detecta el candado "discrepancia (squawk) de severidad ALTA sin resolver"
 * en un ActionResult fallido de asignar avión. Devuelve la lista de
 * descripciones para el diálogo de confirmación, o null si el error es otro.
 *
 * Detección robusta por `code` (el API lo emite en el filtro de excepciones)
 * con respaldo por regex del mensaje (precedente: cargos sin TC en compras),
 * por si el API desplegado aún manda el CONFLICT genérico.
 */
export function squawkAltaDe(res: ResultadoFallido): string[] | null {
  if (res.ok) return null;
  const msg = res.error ?? "";
  const esCandado =
    res.code === SQUAWK_ALTA_CODE ||
    /discrepancia de severidad ALTA/i.test(msg);
  if (!esCandado) return null;
  const deDetails = listaDeDetails(res.details);
  if (deDetails.length > 0) return deDetails;
  // Respaldo: las descripciones van entre paréntesis en el propio mensaje
  // ("… sin resolver (fuga de aceite; tren dañado)").
  const m = /\(([^()]+)\)/.exec(msg);
  if (m) {
    const partes = m[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (partes.length > 0) return partes;
  }
  return [msg];
}

/**
 * Confirmación en dos pasos del candado de squawk ALTA (misma mecánica que
 * "recibir sin TC" en compras): el primer intento va SIN bandera; si el API
 * rechaza por discrepancia ALTA, este diálogo ofrece asignar de todas formas
 * (reintento con `aceptar_discrepancia_alta: true` — el API avisa al
 * mecánico para que valide el avión).
 */
export function SquawkAltaDialog({
  lista,
  pending = false,
  onCancel,
  onConfirm,
}: {
  /** Descripciones de las discrepancias ALTA abiertas; null = cerrado. */
  lista: string[] | null;
  pending?: boolean;
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
          ¿Asignar de todas formas? Se notificará al mecánico para que valide
          que el avión puede volar.
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
            {pending ? "Asignando…" : "Asignar de todas formas"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
