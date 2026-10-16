"use client";

import Link from "next/link";
import { toast } from "sonner";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ETIQUETA_IR_A_REPORTES, avisoMesCerrado, type AvisoMesCerrado as Aviso } from "@/lib/admin/mes-cerrado";

/**
 * Aviso del candado 409 `MES_CERRADO` (16-oct-2026, API 0.0.88) en los
 * formularios de captura. Dos piezas, mismo texto (el `message` del API):
 *  - `toastMesCerradoSiAplica(res)`: si el resultado de la action es el
 *    candado, pinta el toast con «Ir a Reportes» y devuelve true (el
 *    formulario NO pinta su toast genérico); si no, false.
 *  - `<AvisoMesCerrado aviso={…} />`: la misma frase inline (diálogos que
 *    conservan el error en pantalla).
 */

/** Más tiempo que el toast de siempre: hay que leer el mes y el enlace. */
const DURACION_MS = 12_000;

export function toastMesCerradoSiAplica(res: unknown): boolean {
  const aviso = avisoMesCerrado(res);
  if (!aviso) return false;
  toast.error(aviso.texto, {
    duration: DURACION_MS,
    action: aviso.href
      ? {
          label: ETIQUETA_IR_A_REPORTES,
          // Navegación completa a propósito: el toast vive fuera del árbol
          // del router y Reportes repinta todo con el mes elegido.
          onClick: () => window.location.assign(aviso.href as string),
        }
      : undefined,
  });
  return true;
}

export function AvisoMesCerrado({ aviso, className }: { aviso: Aviso | null; className?: string }) {
  if (!aviso) return null;
  return (
    <p
      role="alert"
      data-aviso-mes-cerrado={aviso.periodo ?? ""}
      className={`flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive ${className ?? ""}`}
    >
      <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {aviso.texto}
        {aviso.href && (
          <>
            {" "}
            <Link href={aviso.href} className="cursor-pointer underline underline-offset-2">
              {ETIQUETA_IR_A_REPORTES}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
