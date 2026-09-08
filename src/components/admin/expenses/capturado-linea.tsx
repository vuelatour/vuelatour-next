import type { CapturaLinea } from "@/lib/admin/gastos-captura";

/**
 * Segunda línea bajo la fecha del consumo en TODAS las tablas de gastos:
 * "Capturado 5 sep 14:32 · Luis · app" (hora Cancún). El viewmodel sale de
 * la FUENTE ÚNICA `lineaCaptura()` (@/lib/admin/gastos-captura); aquí solo
 * se pinta: gris cuando todo cuadra, ámbar cuando el ticket trae otro año o
 * una fecha muy lejana de la captura (pista 28-ago).
 */
export function CapturadoLinea({ linea }: { linea: CapturaLinea | null }) {
  if (!linea) return null;
  return (
    <span
      className={
        // max-w + whitespace-normal: la celda Fecha va en nowrap; sin esto un
        // nombre largo ensancha la columna. La línea envuelve a 2 renglones.
        "block max-w-[15rem] whitespace-normal text-[10px] font-normal leading-tight " +
        (linea.ambar
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground")
      }
      title={linea.title}
    >
      {linea.texto}
    </span>
  );
}
