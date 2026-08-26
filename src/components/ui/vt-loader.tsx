import { cn } from "@/lib/utils";

/**
 * Loader de marca VuelaTour: avioncito CSS sobre un arco Bézier que se
 * dibuja (keyframes vt-plane-fly/vt-arc-draw en globals.css, misma estética
 * del hero público). Elección DEL CLIENTE (26-ago): prefirió este sutil
 * sobre el Lottie — la animación public/animations/airplane-animation.json
 * y su reproductor (vt-plane-lottie.tsx / VtPlaneLottie) quedan GUARDADOS
 * para otro uso que el cliente decidirá. Respeta prefers-reduced-motion.
 */

/** Path del ícono Plane de lucide (24×24, apunta 45° arriba-derecha). */
const PLANE_PATH =
  "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";

/** Arco de vuelo (Bézier cuadrática, mismo estilo del hero). */
const ARC_PATH = "M10 54 Q60 6 110 54";

interface VtLoaderProps {
  /** Texto bajo el avión. Cadena vacía = sin texto visible. */
  label?: string;
  className?: string;
}

export function VtLoader({ label = "Cargando…", className }: VtLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-2", className)}
    >
      <svg
        viewBox="0 0 120 64"
        className="w-36 text-brand-600"
        aria-hidden="true"
      >
        {/* Ruta punteada de referencia (como el ghost network del hero). */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="0.5 6"
          opacity="0.35"
        />
        {/* Origen y destino. */}
        <circle cx="10" cy="54" r="2" fill="currentColor" opacity="0.5" />
        <circle cx="110" cy="54" r="2" fill="currentColor" opacity="0.5" />
        {/* Trazo que se dibuja detrás del avión (dasharray + dashoffset,
            como el path activo del hero; glow vía drop-shadow en CSS). */}
        <path
          className="vt-loader-arc"
          d={ARC_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
        />
        {/* Avioncito: el <g> exterior lo mueve CSS (translate+rotate por
            keyframes = puntos y tangentes de la MISMA Bézier del arco); el
            interior centra el ícono en el origen y lo orienta a la derecha. */}
        <g className="vt-loader-plane">
          <g transform="rotate(45) scale(0.85) translate(-12 -12)">
            <path d={PLANE_PATH} fill="currentColor" />
          </g>
        </g>
      </svg>
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : (
        <span className="sr-only">Cargando</span>
      )}
    </div>
  );
}

/** Contenedor centrado de página para los `loading.tsx` del admin. */
export function VtPageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <VtLoader />
    </div>
  );
}

/**
 * Versión mini (~1em) para fallbacks/botones: el avioncito orbita una ruta
 * circular punteada (gira el SVG completo, el avión queda tangente).
 * Hereda color vía `currentColor`.
 */
export function VtSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("vt-spinner inline-block h-[1em] w-[1em]", className)}
      role="status"
      aria-label="Cargando"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="0.5 4"
        opacity="0.4"
      />
      <g transform="translate(12 4) rotate(45) scale(0.55) translate(-12 -12)">
        <path d={PLANE_PATH} fill="currentColor" />
      </g>
    </svg>
  );
}
