import type { ReactNode } from "react";
import {
  NOTA_COLOR_AVION,
  SEMAFORO_CALENDARIO,
} from "@/lib/admin/calendario-semaforo";

/**
 * Leyenda ÚNICA del calendario (22-sep-2026): los CINCO colores del semáforo
 * y la nota de dónde quedó el color de cada avión. Los renglones salen de
 * `lib/admin/calendario-semaforo.ts` — ninguna pantalla vuelve a escribir un
 * hex ni un texto de leyenda a mano.
 *
 * `children` es para notas que NO hablan de color (p. ej. el aviso push al
 * responsable de un evento), que siguen viviendo en la misma línea.
 */
export function LeyendaSemaforo({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {SEMAFORO_CALENDARIO.map((i) => (
        <span
          key={i.clave}
          className="inline-flex items-center gap-1.5 cursor-help"
          title={i.titulo}
        >
          <span
            aria-hidden
            className="h-3 w-3 rounded"
            style={{ backgroundColor: i.color }}
          />
          {i.etiqueta}
        </span>
      ))}
      <span className="text-muted-foreground/70">{NOTA_COLOR_AVION}</span>
      {children}
    </div>
  );
}
