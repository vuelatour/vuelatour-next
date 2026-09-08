"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PreviewError, PreviewEstado } from "@/hooks/use-quote-preview-html";

/**
 * Panel «Vista previa · hoja 1» (F1, 8-sep-2026): pinta el HTML REAL del
 * PDF (mismo armador que pyservices) en un iframe `sandbox=""` + `srcdoc`
 * (sin scripts, sin origen, sin navegación) escalado al ancho disponible
 * con ResizeObserver (la hoja mide 794 px de ancho) y `pointer-events:
 * none` (no se interactúa con la hoja: se edita en el documento).
 *
 * Presentación pura: NO calcula nada ni conoce el form. Recibe el estado
 * del hook `useQuotePreviewHtml` y acciones del padre.
 *
 * FUENTE (F3, 8-sep-2026): el armador declara `'Helvetica Neue', Arial,
 * sans-serif` sin `@font-face`; en el navegador la hoja se pinta con la
 * fuente local del operador y en el contenedor de pyservices con la sans
 * del sistema (no hay Helvetica), así que los saltos de línea de textos
 * largos (notas) pueden variar milimétricamente. El iframe `sandbox=""`
 * SÍ honra un `@font-face` con `src: url(data:...)` embebido en el HTML:
 * el día que pyservices incruste la fuente en `_estilos_cuerpo`, PDF y
 * vista previa compartirán la misma sin tocar el panel — y la nota al pie
 * (`htmlTraeFuente`) desaparece sola.
 */

/** true si el HTML de la hoja trae su propia fuente (`@font-face`). */
export function htmlTraeFuente(html: string | null): boolean {
  return !!html && /@font-face/i.test(html);
}

const NOTA_FUENTE =
  "La fuente en pantalla es la de tu navegador: en el PDF real algún texto largo puede cambiar de renglón.";

/** Ancho natural de la hoja (Letter a 96 dpi ≈ 816; el armador usa 794). */
export const PREVIEW_HOJA_ANCHO_PX = 794;
/** Alto de la hoja mostrada (proporción carta). */
export const PREVIEW_HOJA_ALTO_PX = 1123;

const ESTADO_LABEL: Record<PreviewEstado, string> = {
  faltan_datos: "Faltan datos",
  actualizando: "Actualizando…",
  al_dia: "Al día",
  sin_vista_previa: "Sin vista previa",
};

export interface PreviewAccionPdf {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}

export interface QuotePreviewPaneProps {
  html: string | null;
  estado: PreviewEstado;
  error: PreviewError | null;
  noDisponible: boolean;
  onReintentar: () => void;
  /** Texto del esqueleto cuando faltan datos (default genérico). */
  motivoSinDatos?: string;
  /** «Ver PDF real» / «Guardar y ver PDF» (revisión). Omitido en alta. */
  verPdf?: PreviewAccionPdf;
  /** Botón «Abrir en grande» (omitido dentro del diálogo grande). */
  onAbrirGrande?: () => void;
  /** Anclar / desanclar (solo cuando la pantalla lo permite). */
  anclaje?: { anclada: boolean; onToggle: () => void };
  /** Cerrar (drawer / diálogo). */
  onCerrar?: () => void;
  /** Alto máximo del área de la hoja (px CSS o clase). */
  className?: string;
  /**
   * Nota al pie. Sin `pie`, se muestra la nota de fuente (`NOTA_FUENTE`)
   * mientras el HTML no traiga `@font-face`; `null` la apaga.
   */
  pie?: ReactNode;
  /**
   * Hay borrador sin guardar: «Al día · incluye tus cambios sin guardar» en
   * vez de «· la que verá el cliente» (todavía no lo es).
   */
  conCambiosSinGuardar?: boolean;
}

export function QuotePreviewPane({
  html,
  estado,
  error,
  noDisponible,
  onReintentar,
  motivoSinDatos,
  verPdf,
  onAbrirGrande,
  anclaje,
  onCerrar,
  className,
  pie,
  conCambiosSinGuardar = false,
}: QuotePreviewPaneProps) {
  const actualizando = estado === "actualizando";
  // Nota de fuente: solo con hoja pintada y sin @font-face en el HTML.
  const pieFinal =
    pie !== undefined ? pie : html && !htmlTraeFuente(html) ? NOTA_FUENTE : null;
  return (
    <section
      aria-label="Vista previa de la hoja 1"
      data-guard-exempt
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-medium leading-tight">
            Vista previa · hoja 1
          </p>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
            <EstadoPunto estado={estado} />
            {ESTADO_LABEL[estado]}
            {estado === "al_dia" && (
              <span className="text-muted-foreground/70">
                {conCambiosSinGuardar
                  ? "· incluye tus cambios sin guardar"
                  : "· la que verá el cliente"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onAbrirGrande && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAbrirGrande}
              disabled={!html}
              className="gap-1"
              title="Ver la hoja a tamaño completo"
            >
              <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
              Abrir en grande
            </Button>
          )}
          {verPdf && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={verPdf.onClick}
              disabled={verPdf.disabled || verPdf.loading}
              className="gap-1"
              title={verPdf.title}
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              {verPdf.loading ? "Generando…" : verPdf.label}
            </Button>
          )}
          {anclaje && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={anclaje.onToggle}
              className="text-xs"
              title={
                anclaje.anclada
                  ? "Quitar la vista previa del costado (se abre desde la barra)"
                  : "Dejar la vista previa fija a la derecha del documento"
              }
            >
              {anclaje.anclada ? "Desanclar" : "Anclar"}
            </Button>
          )}
          {onCerrar && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onCerrar}
              aria-label="Cerrar vista previa"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Banda de aviso: nunca bloquea guardar; la hoja anterior se queda. */}
      {estado === "sin_vista_previa" && (
        <div
          className={cn(
            "flex items-start gap-2 border-b px-3 py-2 text-xs",
            noDisponible
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {noDisponible ? (
            <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">
              {noDisponible
                ? "Vista previa no disponible por ahora"
                : "No se pudo generar la vista previa"}
            </p>
            <p className="opacity-90">
              {noDisponible
                ? "El servidor aún no genera la hoja. Puedes seguir cotizando y guardando; el PDF real sigue funcionando."
                : (error?.message ?? "Inténtalo de nuevo.")}
            </p>
            <button
              type="button"
              onClick={onReintentar}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted/40 p-2">
        {html ? (
          <HojaEscalada html={html} atenuada={actualizando || estado === "sin_vista_previa"} />
        ) : estado === "faltan_datos" || estado === "sin_vista_previa" ? (
          <EsqueletoHoja
            texto={
              estado === "sin_vista_previa"
                ? "Aquí aparecerá la hoja 1 cuando el servidor la genere."
                : (motivoSinDatos ??
                  "Completa aeronave, ruta y pasajeros para ver la hoja 1.")
            }
          />
        ) : (
          <EsqueletoHoja texto="Generando la hoja 1…" pulso />
        )}
      </div>
      {pieFinal && (
        <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          {pieFinal}
        </p>
      )}
    </section>
  );
}

function EstadoPunto({ estado }: { estado: PreviewEstado }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        estado === "al_dia" && "bg-emerald-500",
        estado === "actualizando" && "bg-amber-500 animate-pulse",
        estado === "sin_vista_previa" && "bg-destructive",
        estado === "faltan_datos" && "bg-muted-foreground/40",
      )}
    />
  );
}

/**
 * Hoja de 794 px escalada al ancho del contenedor (ResizeObserver →
 * transform: scale). El iframe es opaco (sandbox sin same-origin): no se
 * puede medir su contenido, así que la altura es la proporción carta y el
 * contenido nunca se desborda (scroll interno apagado por pointer-events).
 */
export function HojaEscalada({
  html,
  atenuada = false,
  maxAncho = PREVIEW_HOJA_ANCHO_PX,
}: {
  html: string;
  atenuada?: boolean;
  /** Tope del ancho de la hoja (por default, tamaño natural). */
  maxAncho?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const anchoUtil = Math.min(ancho || PREVIEW_HOJA_ANCHO_PX, maxAncho);
  const escala = anchoUtil / PREVIEW_HOJA_ANCHO_PX;
  return (
    <div ref={ref} className="mx-auto w-full" style={{ maxWidth: maxAncho }}>
      <div
        className={cn(
          "relative overflow-hidden bg-white shadow-md ring-1 ring-black/10 transition-opacity",
          atenuada && "opacity-60",
        )}
        style={{
          width: anchoUtil,
          height: Math.round(PREVIEW_HOJA_ALTO_PX * escala),
        }}
      >
        <iframe
          title="Vista previa de la hoja 1 de la cotización"
          sandbox=""
          srcDoc={html}
          tabIndex={-1}
          aria-hidden="true"
          scrolling="no"
          style={{
            width: PREVIEW_HOJA_ANCHO_PX,
            height: PREVIEW_HOJA_ALTO_PX,
            border: 0,
            transform: `scale(${escala})`,
            transformOrigin: "top left",
            pointerEvents: "none",
            display: "block",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}

function EsqueletoHoja({ texto, pulso = false }: { texto: string; pulso?: boolean }) {
  return (
    <div
      className="mx-auto w-full bg-white/70 p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/5"
      style={{ maxWidth: PREVIEW_HOJA_ANCHO_PX, aspectRatio: `${PREVIEW_HOJA_ANCHO_PX} / ${PREVIEW_HOJA_ALTO_PX}` }}
      role="status"
      aria-live="polite"
    >
      <div className={cn("space-y-3", !pulso && "[&_[data-slot=skeleton]]:animate-none")}>
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3 justify-self-end" />
        </div>
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}

/**
 * «Abrir en grande» / botón de la barra en pantallas sin anclaje: diálogo
 * casi a pantalla completa con la hoja a su tamaño natural (o menor si no
 * cabe) y scroll vertical.
 */
export function QuotePreviewDialog({
  open,
  onOpenChange,
  ...pane
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & Omit<QuotePreviewPaneProps, "onAbrirGrande" | "onCerrar" | "className">) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[94vh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-2rem,900px)]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Vista previa · hoja 1</DialogTitle>
          <DialogDescription>
            Hoja 1 del PDF de la cotización tal como la verá el cliente.
          </DialogDescription>
        </DialogHeader>
        <QuotePreviewPane
          {...pane}
          onCerrar={() => onOpenChange(false)}
          className="h-full min-h-0 rounded-xl border-0"
        />
      </DialogContent>
    </Dialog>
  );
}
