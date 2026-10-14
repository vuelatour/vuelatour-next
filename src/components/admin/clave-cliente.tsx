"use client";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  TEXTO_NO_SE_PUDO_COPIAR,
  TITULO_CLAVE_CLIENTE,
  TITULO_COPIAR_CLAVE,
  textoClaveCopiada,
} from "@/lib/admin/clave-cliente";

/**
 * Componente ÚNICO de UI del ID de vuelo por cliente («january02-211026»,
 * 13-oct-2026, API 0.0.75). El ID lo ARMA el API (`clave_cliente`) y aquí
 * solo se PINTA tal cual llega; sin clave (API previo, migración sin
 * aplicar o lectura fallida) no se pinta nada y se ve solo el folio, que
 * NUNCA se quita. Textos en `lib/admin/clave-cliente.ts`.
 */

export interface CopiarClaveDeps {
  /** Escribe en el portapapeles (default: `navigator.clipboard.writeText`). */
  escribir?: (texto: string) => Promise<void>;
  /** Aviso de éxito (default: `toast.success`). */
  ok?: (mensaje: string) => void;
  /** Aviso de fallo (default: `toast.error`). */
  error?: (mensaje: string) => void;
}

/**
 * Copia el ID al portapapeles y lo avisa. Cualquier fallo (sin `navigator`,
 * sin permiso, contexto inseguro) avisa «No se pudo copiar…» y devuelve
 * false; nunca lanza.
 */
export async function copiarClaveCliente(
  clave: string,
  deps: CopiarClaveDeps = {},
): Promise<boolean> {
  const ok = deps.ok ?? ((m: string) => void toast.success(m));
  const error = deps.error ?? ((m: string) => void toast.error(m));
  try {
    const escribir = deps.escribir ?? ((t: string) => navigator.clipboard.writeText(t));
    await escribir(clave);
  } catch {
    error(TEXTO_NO_SE_PUDO_COPIAR);
    return false;
  }
  ok(textoClaveCopiada(clave));
  return true;
}

/**
 * Línea del ID BAJO el folio en las listas (Vuelos, Cotizaciones y «Vuelos»
 * del avión). Sin hooks. Sin clave ⇒ null (la celda queda como siempre).
 */
export function ClaveClienteLinea({ clave }: { clave?: string | null }) {
  if (!clave) return null;
  return (
    <span
      data-clave-cliente={clave}
      title={TITULO_CLAVE_CLIENTE}
      className="block whitespace-nowrap font-mono text-[11px] leading-tight text-muted-foreground"
    >
      {clave}
    </span>
  );
}

/**
 * Chip-botón COPIABLE junto al h1 del vuelo y de la cotización (va JUNTO al
 * h1, nunca dentro: el título sigue siendo «Vuelo #376»). Sin clave ⇒ null.
 */
export function ClaveClienteCabecera({ clave }: { clave?: string | null }) {
  if (!clave) return null;
  return (
    <button
      type="button"
      data-clave-cliente={clave}
      title={TITULO_COPIAR_CLAVE}
      aria-label={`Copiar ID del vuelo ${clave}`}
      onClick={() => void copiarClaveCliente(clave)}
      className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {clave}
      <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
