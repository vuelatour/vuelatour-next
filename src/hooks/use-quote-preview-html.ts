"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PreviewCache } from "@/lib/admin/quote-preview-cache";
import type { CalculateQuoteRequest } from "@/types/quote";

/**
 * HOJA REAL del PDF (F1, 8-sep-2026). Desde el ensamble form-as-document
 * (8-sep) la hoja editable `QuoteSheet` ES la vista previa; este hook queda
 * para pedir la hoja del PDF GUARDADO con el form limpio (una vez por
 * versión) y reutilizar su MAPA (`extraerMapaSvgDeHtml`) — en lectura es la
 * única fuente del mapa. El panel/diálogo de vista previa, el anclaje
 * (`vt-cotizador-preview-v1`) y `useMediaQuery` se retiraron con él.
 *
 * Principio (§6 del rediseño): la preview NO es un dibujo del panel — es el
 * HTML que WeasyPrint convierte en PDF, armado por el API con el MISMO
 * payload (`POST /v1/quotes/preview-html` vía el proxy
 * `/api/quotes/preview-html`). Este hook solo orquesta:
 *
 * - ENCADENADO al breakdown FRESCO: el caller pasa `listo=true` únicamente
 *   cuando `/calculate` ya respondió al MISMO payload (mismo debounce de
 *   350 ms). Nunca se pide la hoja antes de que el cálculo termine.
 * - `AbortController` por request: al cambiar el payload (o al dejar de
 *   estar listo) la petición anterior se cancela.
 * - Caché LRU de 20 por hash del payload (`PreviewCache`): deshacer un
 *   cambio no vuelve a pedir la hoja.
 * - Con el form LIMPIO y `quote_id` el caller manda `sucio:false`: el API
 *   devuelve exactamente la hoja del PDF guardado (sin recalcular) y, por
 *   la caché, se pide UNA sola vez mientras no cambie la versión.
 *
 * Estados: `faltan_datos` (sin payload → esqueleto) · `actualizando` (hay
 * payload nuevo y la hoja de antes se atenúa, NUNCA se limpia) · `al_dia` ·
 * `sin_vista_previa` (error → banda con reintentar; jamás bloquea guardar).
 */

export interface EscalaPdfPreview {
  /** Orden 1..N del tramo en el form (mismo índice que `escalas`). */
  orden: number;
  pdf_oculto?: boolean;
  /** 'YYYY-MM-DD' de pared (solo PDF). */
  pdf_fecha?: string | null;
}

/** `PreviewQuoteDto` del API: todo /calculate + presentación + identidad. */
export interface QuotePreviewPayload extends CalculateQuoteRequest {
  quote_id?: string;
  fecha_traslado_inicial?: string;
  fecha_traslado_final?: string;
  notas?: string;
  escalas_pdf?: EscalaPdfPreview[];
  operador_externo?: string;
  /** false + quote_id = hoja del PDF ya guardado (sin recalcular). */
  sucio?: boolean;
}

export type PreviewEstado =
  | "faltan_datos"
  | "actualizando"
  | "al_dia"
  | "sin_vista_previa";

export interface PreviewError {
  message: string;
  code: string;
  status: number;
}

/** Código que manda el proxy cuando el API aún no tiene el endpoint. */
export const PREVIEW_NO_DISPONIBLE = "PREVIEW_NO_DISPONIBLE";

export interface QuotePreviewHtml {
  /** Última hoja recibida (puede corresponder a un payload anterior). */
  html: string | null;
  estado: PreviewEstado;
  error: PreviewError | null;
  /** El servidor no tiene el endpoint (404): aviso, no error. */
  noDisponible: boolean;
  reintentar: () => void;
}

export function useQuotePreviewHtml({
  payload,
  listo,
  activo,
}: {
  /** Payload memoizado (null = faltan datos para armar la hoja). */
  payload: QuotePreviewPayload | null;
  /** true solo cuando el breakdown de /calculate corresponde a `payload`. */
  listo: boolean;
  /** El panel está visible (anclado, drawer, pill o «en grande»). */
  activo: boolean;
}): QuotePreviewHtml {
  const json = useMemo(() => (payload ? JSON.stringify(payload) : null), [payload]);
  // Caché por instancia (lazy): sobrevive a los re-renders, no a la página.
  const [cache] = useState(() => new PreviewCache(20));
  // Hit de caché resuelto en render (deshacer un cambio no vuelve a pedir).
  const enCache = json ? cache.get(json) : null;

  const [hoja, setHoja] = useState<{ json: string; html: string } | null>(null);
  const [fallo, setFallo] = useState<{ json: string; error: PreviewError } | null>(null);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    if (!activo || !json || !listo) return;
    if (cache.get(json) != null) return;
    const ctrl = new AbortController();
    fetch("/api/quotes/preview-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          let message = "No se pudo generar la vista previa.";
          let code = "PREVIEW_ERROR";
          try {
            const body = (await res.json()) as { message?: unknown; code?: unknown };
            if (typeof body.message === "string" && body.message) message = body.message;
            if (typeof body.code === "string" && body.code) code = body.code;
          } catch {
            // sin JSON: genérico
          }
          throw Object.assign(new Error(message), { code, status: res.status });
        }
        return res.text();
      })
      .then((html) => {
        if (ctrl.signal.aborted) return;
        cache.set(json, html);
        setHoja({ json, html });
        setFallo(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const e = err as { message?: string; code?: string; status?: number };
        setFallo({
          json,
          error: {
            message: e?.message || "No se pudo generar la vista previa.",
            code: e?.code || "PREVIEW_ERROR",
            status: typeof e?.status === "number" ? e.status : 0,
          },
        });
      });
    return () => {
      ctrl.abort();
    };
  }, [activo, json, listo, reintento, cache]);

  const reintentar = useCallback(() => {
    setFallo(null);
    setReintento((n) => n + 1);
  }, []);

  const estado: PreviewEstado = !json
    ? "faltan_datos"
    : enCache != null || hoja?.json === json
      ? "al_dia"
      : fallo?.json === json
        ? "sin_vista_previa"
        : "actualizando";

  const error = estado === "sin_vista_previa" ? fallo!.error : null;
  return {
    html: enCache ?? hoja?.html ?? null,
    estado,
    error,
    noDisponible: error?.code === PREVIEW_NO_DISPONIBLE,
    reintentar,
  };
}
