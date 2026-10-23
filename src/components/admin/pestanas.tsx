"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pestanaInicial, siguientePestana, type PestanaDef } from "@/lib/admin/pestanas";

export type { PestanaDef } from "@/lib/admin/pestanas";

/** `pagina`: la tira principal de una pantalla; `secundaria`: pastillas dentro de una sección. */
export type VariantePestanas = "pagina" | "secundaria";

const ESTILO_LISTA: Record<VariantePestanas, string> = {
  pagina: "flex flex-wrap items-center gap-2",
  secundaria: "flex flex-wrap items-center gap-1.5",
};

const ESTILO_PESTANA: Record<VariantePestanas, { base: string; activa: string; inactiva: string }> = {
  pagina: {
    base: "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    activa: "bg-brand-600 text-white",
    inactiva: "bg-muted text-muted-foreground hover:text-foreground",
  },
  secundaria: {
    base: "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    activa: "border-brand-600/40 bg-brand-600/10 text-brand-700 dark:text-brand-300",
    inactiva: "border-border bg-background text-muted-foreground hover:text-foreground",
  },
};

/**
 * Pestañas accesibles (23-oct-2026): `role="tablist"` / `role="tab"` /
 * `aria-selected` / `aria-controls` / `role="tabpanel"`, ← → Inicio Fin con
 * activación automática (`lib/admin/pestanas.ts`) y tabindex itinerante.
 * SOLO se pinta el panel activo. El estado vive aquí (cliente); los paneles
 * llegan YA renderizados por el servidor (`paneles`), así que las tablas
 * siguen siendo SSR. Con `parametroUrl` cada cambio reescribe `?<param>=`
 * con `history.replaceState` (sin recargar ni apilar historial) para que la
 * pestaña se pueda enlazar. Nada se guarda en el navegador.
 */
export function Pestanas({
  etiquetaLista,
  pestanas,
  inicial = null,
  paneles,
  variante = "pagina",
  parametroUrl,
  className,
}: {
  /** Nombre accesible de la lista («Secciones del reparto del avión»). */
  etiquetaLista: string;
  pestanas: PestanaDef[];
  /** Clave inicial (si no existe, la primera). */
  inicial?: string | null;
  /** Un panel por clave, ya renderizado. */
  paneles: Record<string, ReactNode>;
  variante?: VariantePestanas;
  /** Parámetro de la URL que refleja la pestaña activa (p. ej. `seccion`). */
  parametroUrl?: string;
  className?: string;
}) {
  const idBase = useId();
  const [elegida, setElegida] = useState<string | null>(() => pestanaInicial(pestanas, inicial));
  const botones = useRef<Map<string, HTMLButtonElement>>(new Map());
  if (pestanas.length === 0) return null;
  // Si las pestañas cambiaron y la elegida ya no está, manda la primera.
  const activa = pestanaInicial(pestanas, elegida) as string;
  const claves = pestanas.map((p) => p.clave);
  const estilo = ESTILO_PESTANA[variante];

  const elegir = (clave: string) => {
    setElegida(clave);
    if (parametroUrl) escribirParametroUrl(parametroUrl, clave);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const destino = siguientePestana(claves, activa, e.key);
    if (!destino) return;
    e.preventDefault();
    elegir(destino);
    botones.current.get(destino)?.focus();
  };

  return (
    <div className={cn("space-y-3", className)} data-pestanas={variante}>
      <div role="tablist" aria-label={etiquetaLista} className={ESTILO_LISTA[variante]}>
        {pestanas.map((p) => {
          const esActiva = p.clave === activa;
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              id={`${idBase}-tab-${p.clave}`}
              aria-selected={esActiva}
              aria-controls={`${idBase}-panel-${p.clave}`}
              tabIndex={esActiva ? 0 : -1}
              title={p.title}
              data-pestana={p.clave}
              data-activa={esActiva ? "" : undefined}
              ref={(el) => {
                if (el) botones.current.set(p.clave, el);
                else botones.current.delete(p.clave);
              }}
              onClick={() => elegir(p.clave)}
              onKeyDown={onKeyDown}
              className={cn(estilo.base, esActiva ? estilo.activa : estilo.inactiva)}
            >
              {p.etiqueta}
              {p.conteo != null && (
                <>
                  {" "}
                  <span className={cn("tabular-nums", esActiva ? "opacity-90" : "opacity-80")}>({p.conteo})</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${idBase}-panel-${activa}`}
        aria-labelledby={`${idBase}-tab-${activa}`}
        data-panel-pestana={activa}
      >
        {paneles[activa]}
      </div>
    </div>
  );
}

/** `?<param>=<valor>` en la barra, sin recargar ni apilar historial. */
function escribirParametroUrl(parametro: string, valor: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(parametro, valor);
  window.history.replaceState(window.history.state, "", url);
}
