"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import type { PreviewError, PreviewEstado } from "@/hooks/use-quote-preview-html";

/** Ancho del papel CARTA a 96 dpi, el mismo que usa la hoja del cliente. */
const ANCHO_PX = 794;

/**
 * PESTAÑA «PDF del cliente» (Fase 2.3 · BLOQUE C, 22-sep-2026): la vista
 * previa REAL que arma el API con el MISMO payload del PDF
 * (`POST /v1/quotes/preview-html` → pyservices `_build_html`, vía el proxy
 * `/api/quotes/preview-html` que ya existía).
 *
 * POR QUÉ EL HTML DEL API Y NO LA RÉPLICA: la pestaña promete «esto es
 * exactamente lo que verá el cliente». La réplica `QuoteSheet` es fiel —seis
 * fixtures la custodian byte a byte— pero es una réplica: el documento
 * verdadero lo arma el mismo código que imprime el PDF. Mientras llega (o si
 * el servidor no tiene el endpoint) se pinta esa réplica como RESPALDO, nunca
 * una pantalla en blanco.
 *
 * EN UN `<iframe srcDoc>` a propósito: `render_cotizacion_preview_html`
 * devuelve un documento COMPLETO con su `<style>` (el CSS de pantalla de
 * pyservices, que no es el del panel). Inyectarlo con `dangerouslySetInnerHTML`
 * metería esas reglas en el shell del admin. El iframe lo aísla; va sin
 * `allow-scripts` (el documento no trae ninguno) y con `allow-same-origin`
 * solo para poder MEDIR su alto y que no quede una barra de scroll dentro.
 */
export function QuotePdfClienteVista({
  html,
  estado,
  error,
  noDisponible,
  onReintentar,
  respaldo,
}: {
  html: string | null;
  estado: PreviewEstado;
  error: PreviewError | null;
  /** El API todavía no tiene el endpoint (404): aviso, no error. */
  noDisponible: boolean;
  onReintentar: () => void;
  /** La hoja `QuoteSheet` en LECTURA: se pinta mientras no haya documento. */
  respaldo: ReactNode;
}) {
  const [alto, setAlto] = useState(0);
  const [ancho, setAncho] = useState(0);
  const cajaRef = useRef<HTMLDivElement>(null);
  const marcoRef = useRef<HTMLIFrameElement>(null);

  // Escala al ancho disponible, igual que el papel de las dos hojas.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja || typeof ResizeObserver === "undefined") return;
    const medir = () => setAncho(caja.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caja);
    return () => ro.disconnect();
  }, []);

  // Alto REAL del documento: sin esto el iframe se queda en su alto por
  // defecto y la cotización se lee por una ventanita con scroll propio.
  const medirAlto = () => {
    try {
      const doc = marcoRef.current?.contentDocument;
      if (!doc?.body) return;
      setAlto(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
    } catch {
      // Sin acceso al documento (navegador restrictivo): queda el alto
      // mínimo y el iframe hace su propio scroll. Nunca se rompe.
    }
  };
  useEffect(() => {
    if (!html) return;
    // El `srcDoc` puede tardar un tick en pintar tras el `load`.
    const t = setTimeout(medirAlto, 60);
    return () => clearTimeout(t);
  }, [html]);

  const escala = ancho > 0 ? Math.min(1, ancho / ANCHO_PX) : 1;
  const altoCaja = alto > 0 ? Math.round(alto * escala) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Vista previa REAL del PDF: la arma el servidor con el mismo payload que el archivo. Solo
          lectura — se edita en la hoja interna.
        </span>
        {estado === "actualizando" && <span className="animate-pulse">actualizando…</span>}
        {estado === "al_dia" && html && <span className="text-emerald-600 dark:text-emerald-400">al día</span>}
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            {noDisponible
              ? "Este servidor todavía no genera la vista previa: abajo va la réplica de la hoja, que es la misma que imprime el PDF."
              : `${error.message} Abajo va la réplica de la hoja.`}
          </p>
          {!noDisponible && (
            <button
              type="button"
              onClick={onReintentar}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reintentar
            </button>
          )}
        </div>
      )}

      {html ? (
        <div
          ref={cajaRef}
          className={cn(
            "overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/10 transition-opacity",
            estado === "actualizando" && "opacity-60",
          )}
          style={{ height: altoCaja }}
        >
          <iframe
            ref={marcoRef}
            title="Vista previa del PDF del cliente"
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={medirAlto}
            className="block border-0"
            style={{
              width: ANCHO_PX,
              height: alto || 1123,
              transform: escala !== 1 ? `scale(${escala})` : undefined,
              transformOrigin: "top left",
            }}
          />
        </div>
      ) : (
        <div ref={cajaRef}>{respaldo}</div>
      )}
    </div>
  );
}
