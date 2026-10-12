import type { ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

/**
 * Texto plegable server-safe (12-oct-2026): un `<details>` nativo CERRADO,
 * sin memoria ni hooks, con el contenido SIEMPRE montado (el SSR lo imprime:
 * un lector de pantalla o una prueba de texto lo encuentran igual). Sirve
 * para esconder una explicación larga sin sacarla del DOM, p. ej. «¿Qué trae
 * cada libro?» bajo los balances de `/admin/reportes`.
 *
 * (`FichaPlegable` de inventario es cliente, con lógica de hash y piel de
 * card propia: no aplica aquí.)
 */
export function TextoPlegable({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group", className)}>
      {/* `min-h-6` + `px-1 -mx-1`: objetivo táctil de 24 px (WCAG 2.5.8) sin mover el texto. */}
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 -mx-1 text-xs font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {titulo}
      </summary>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">{children}</div>
    </details>
  );
}
