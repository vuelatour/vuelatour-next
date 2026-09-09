"use client";

import { useEffect, useMemo, useState } from "react";
import type { TramoMapaPayload } from "@/lib/admin/quote-sheet";

/**
 * Mapa REAL de la hoja editable (form-as-document, 8-sep-2026): el `<svg>`
 * lo dibuja pyservices (`POST /reportes/cotizacion/mapa-svg`, el MISMO
 * código del PDF) vía el API y el proxy `/api/quotes/mapa-svg`; el panel lo
 * inyecta INLINE dentro de `<div class="mapa">` (nunca <img>: los <text>
 * heredan Arimo de `.cot-hoja` igual que en el PDF).
 *
 * - Debounce de 500 ms sobre la clave de puntos (los tramos con extremos).
 * - Caché por clave (deshacer no vuelve a pedir); `AbortController` por
 *   petición (última gana).
 * - 204 = ningún tramo con coordenadas → la hoja NO lleva mapa (null).
 * - `svgFijo` (form limpio + `quote_id`): se reutiliza el mapa del PDF
 *   guardado (extraído de la vista previa) sin pedir nada.
 * - Mientras se actualiza se conserva el svg anterior (`actualizando`).
 */
export type MapaEstado = "sin_mapa" | "actualizando" | "al_dia" | "error";

export interface QuoteMapaSvg {
  svg: string | null;
  estado: MapaEstado;
  error: string | null;
}

const DEBOUNCE_MS = 500;
const LIMITE_CACHE = 30;

export function useQuoteMapaSvg({
  tramos,
  activo = true,
  svgFijo,
}: {
  /** Tramos del borrador con extremos capturados (con `pdf_oculto` si aplica). */
  tramos: TramoMapaPayload[];
  /** false = no pedir (hoja oculta, lectura sin cambios). */
  activo?: boolean;
  /** Mapa ya resuelto: undefined = pedirlo; null = sin mapa; string = usar tal cual. */
  svgFijo?: string | null;
}): QuoteMapaSvg {
  const clave = useMemo(() => JSON.stringify(tramos), [tramos]);
  const [claveDebounced, setClaveDebounced] = useState(clave);
  useEffect(() => {
    if (clave === claveDebounced) return;
    const t = setTimeout(() => setClaveDebounced(clave), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [clave, claveDebounced]);

  // Caché por instancia (contenedor estable en state, como `PreviewCache`
  // en `useQuotePreviewHtml`): sobrevive a los re-renders, no a la página.
  const [cache] = useState(() => new Map<string, string | null>());
  const [resultado, setResultado] = useState<{ clave: string; svg: string | null } | null>(null);
  const [fallo, setFallo] = useState<{ clave: string; mensaje: string } | null>(null);

  const fijo = svgFijo !== undefined;
  const vacio = tramos.length === 0;

  useEffect(() => {
    if (fijo || !activo || vacio) return;
    if (cache.has(claveDebounced)) return;
    const ctrl = new AbortController();
    fetch("/api/quotes/mapa-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalas: JSON.parse(claveDebounced) as TramoMapaPayload[] }),
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status === 204) return null;
        if (!res.ok) {
          let message = "No se pudo dibujar el mapa.";
          try {
            const body = (await res.json()) as { message?: unknown };
            if (typeof body.message === "string" && body.message) message = body.message;
          } catch {
            // sin JSON
          }
          throw new Error(message);
        }
        const txt = await res.text();
        return txt.trim().startsWith("<svg") ? txt : null;
      })
      .then((svg) => {
        if (ctrl.signal.aborted) return;
        const m = cache;
        if (m.has(claveDebounced)) m.delete(claveDebounced);
        m.set(claveDebounced, svg);
        while (m.size > LIMITE_CACHE) {
          const viejo = m.keys().next().value;
          if (viejo === undefined) break;
          m.delete(viejo);
        }
        setResultado({ clave: claveDebounced, svg });
        setFallo(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setFallo({
          clave: claveDebounced,
          mensaje: err instanceof Error ? err.message : "No se pudo dibujar el mapa.",
        });
      });
    return () => ctrl.abort();
  }, [claveDebounced, activo, fijo, vacio, cache]);

  if (fijo) {
    return { svg: svgFijo ?? null, estado: svgFijo ? "al_dia" : "sin_mapa", error: null };
  }
  if (vacio) return { svg: null, estado: "sin_mapa", error: null };

  const enCache = cache.has(clave) ? (cache.get(clave) ?? null) : undefined;
  if (enCache !== undefined) {
    return { svg: enCache, estado: enCache ? "al_dia" : "sin_mapa", error: null };
  }
  if (resultado?.clave === clave) {
    return { svg: resultado.svg, estado: resultado.svg ? "al_dia" : "sin_mapa", error: null };
  }
  if (fallo?.clave === claveDebounced && claveDebounced === clave) {
    return { svg: resultado?.svg ?? null, estado: "error", error: fallo.mensaje };
  }
  // Actualizando: se conserva el mapa anterior (si lo hay) atenuado.
  return { svg: resultado?.svg ?? null, estado: "actualizando", error: null };
}
