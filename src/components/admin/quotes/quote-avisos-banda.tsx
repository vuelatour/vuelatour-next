"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * AVISOS DE CAPTURA del cotizador (capacidad del avión, ancla CUN, millas en
 * 0, costo del operador externo en MXN sin T.C.…), en una banda ÁMBAR de
 * ancho completo ARRIBA del papel (Fase 2.3 · BLOQUE C, 22-sep-2026).
 *
 * POR QUÉ AQUÍ: hasta hoy vivían dentro del panel lateral «Interno · no se
 * imprime», que estaba CERRADO por defecto — el aviso solo se leía si alguien
 * abría el cajón (el botón del borde llevaba el conteo, pero no el texto). Al
 * retirar el panel suben al sitio donde ya viven las demás bandas del
 * cotizador: fuera del documento, a la vista y **nunca plegables** — un
 * warning no se esconde detrás de un triángulo.
 *
 * El chip de la `TotalBar` sigue igual (`avisos={avisosCaptura}`): son dos
 * portadores del MISMO texto, no dos fuentes.
 */
export function QuoteAvisosBanda({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <ul className="min-w-0 flex-1 space-y-0.5">
        {avisos.map((a) => (
          <li key={a} className="text-amber-700 dark:text-amber-400">
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
