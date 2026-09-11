/**
 * Candado «discrepancia (squawk) de severidad ALTA sin resolver» del API:
 * DETECCIÓN pura, sin React ni server actions, para que la compartan el
 * diálogo de vuelos (`components/admin/flights/squawk-alta-dialog.tsx`, que
 * la re-exporta por compatibilidad) y el cotizador (11-sep-2026: `revise`
 * valida el avión como `assign` cuando el cotizador lo CAMBIA).
 *
 * FUENTE ÚNICA: si esto se duplica, un sitio deja de ofrecer el «de todas
 * formas» y el operador queda atorado sin saber por qué.
 */

/** Código del candado en el API (filtro de excepciones). */
export const SQUAWK_ALTA_CODE = "SQUAWK_ALTA_SIN_RESOLVER";

/** Shape mínimo del ActionResult fallido (evita acoplarse a un módulo "use server"). */
export interface ResultadoFallido {
  ok: boolean;
  error?: string;
  code?: string;
  details?: unknown;
  /** HTTP del API cuando el error viene de él (409 = candado/concurrencia). */
  status?: number;
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
