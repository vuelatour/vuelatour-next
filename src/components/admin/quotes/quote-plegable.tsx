"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRightIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

/**
 * SUB-BLOQUE PLEGABLE bajo el papel de la cotización (Fase 2.3, 22-sep-2026).
 * Al retirar el panel lateral «Interno · no se imprime», lo que NO tiene un
 * renglón donde vivir dentro del documento —los toggles del PDF del cliente,
 * la plantilla de ruta del catálogo, y más adelante el operador externo, la
 * ruta operativa y el detalle del motor— baja aquí, DEBAJO de la hoja: el
 * título y el resumen se leen siempre, el contenido se despliega.
 *
 * DOS REGLAS QUE NO SE PUEDEN ROMPER (riesgo 9 del diseño):
 *
 * 1. **El contenido NUNCA se desmonta.** Es un `<details>` nativo: sus hijos
 *    están en el DOM esté abierto o cerrado. Un `{abierto && …}` tiraría los
 *    `register()`/`setValue` de dentro —se perdería lo tecleado— y dejaría sin
 *    destino a los ids ancla (`billpocket-field`, `seccion-externo`…) que
 *    otros componentes resuelven con `document.getElementById`.
 * 2. **Solo el `<summary>` va `data-guard-exempt`**: abrir o cerrar no edita
 *    nada, así que no debe disparar la confirmación única de
 *    CONFIRMADO/RESERVA. Lo de dentro SÍ edita y NO va exento.
 *
 * Un `aviso` (chip ámbar) se ve SIEMPRE, plegado o no: un warning jamás se
 * esconde detrás de un triángulo.
 */
export function QuotePlegable({
  id,
  titulo,
  resumen,
  aviso,
  abiertoPorDefecto = false,
  forzarAbierto = false,
  children,
  className,
}: {
  /** Sufijo de la clave de memoria y del id DOM (`plegable-<id>`). */
  id: string;
  titulo: string;
  /** Una línea con lo esencial: se lee sin abrir. */
  resumen?: ReactNode;
  /** Ámbar: se pinta aunque esté plegado. */
  aviso?: string | null;
  abiertoPorDefecto?: boolean;
  /**
   * Dentro hay un campo OBLIGATORIO que no puede quedar escondido (hoy: el
   * operador externo al prender «cubierto por externo», igual que hacía el
   * `SubBloque` del panel). Abre al montar si ya viene en true y cada vez que
   * pase de false a true; cerrarlo después es decisión del operador y se
   * recuerda hasta el siguiente encendido.
   */
  forzarAbierto?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [abierto, setAbierto] = useMemoriaPlegado(id, abiertoPorDefecto);
  // `false` inicial A PROPÓSITO: montar con `forzarAbierto` en true (revisar
  // una cotización externa, restaurar un borrador `?d=`) también abre. El
  // efecto no lee `abierto`, así que no hay bucle ni se pisa un cierre
  // posterior del operador.
  const forzadoPrev = useRef(false);
  useEffect(() => {
    if (forzarAbierto && !forzadoPrev.current) setAbierto(true);
    forzadoPrev.current = forzarAbierto;
  }, [forzarAbierto, setAbierto]);
  return (
    <details
      id={`plegable-${id}`}
      open={abierto}
      onToggle={(e) => {
        const v = (e.currentTarget as HTMLDetailsElement).open;
        if (v !== abierto) setAbierto(v);
      }}
      className={cn(
        "rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20",
        className,
      )}
    >
      <summary
        data-guard-exempt
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden"
      >
        <ChevronRightIcon
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            abierto && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="font-medium">{titulo}</span>
        {resumen && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{resumen}</span>
        )}
        {aviso && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            <ExclamationTriangleIcon className="h-3 w-3" />
            {aviso}
          </span>
        )}
      </summary>
      <div className="space-y-3 border-t border-dashed border-muted-foreground/30 px-3 py-3">
        {children}
      </div>
    </details>
  );
}

// ---------- Memoria por usuario (localStorage, patrón `vt-cotizador-*`) ----------

const CLAVE = (id: string) => `vt-cotizador-plegado-${id}-v1`;
const oyentes = new Map<string, Set<() => void>>();

function avisar(clave: string) {
  oyentes.get(clave)?.forEach((cb) => cb());
}

function leer(clave: string, defecto: boolean): boolean {
  try {
    const raw = localStorage.getItem(clave);
    return raw == null ? defecto : JSON.parse(raw) === true;
  } catch {
    // Sin storage (ventana privada, cookies bloqueadas): el valor por defecto.
    return defecto;
  }
}

/**
 * Abierto/cerrado recordado por usuario. Se lee con `useSyncExternalStore` y
 * NO con `useState` + efecto: el servidor no tiene localStorage, así que el
 * snapshot de servidor es el valor por defecto y el del navegador el
 * recordado — React se encarga de la transición al hidratar (mismo patrón que
 * `DatosSoporte` con la ruta). Leer en un efecto y hacer `setState` provocaría
 * el render en cascada que el linter de React marca.
 *
 * El snapshot devuelve un BOOLEANO (primitivo): leerlo en cada render no crea
 * valores nuevos ni bucles.
 */
function useMemoriaPlegado(id: string, defecto: boolean): [boolean, (v: boolean) => void] {
  const clave = CLAVE(id);
  const suscribir = useCallback(
    (cb: () => void) => {
      let set = oyentes.get(clave);
      if (!set) {
        set = new Set();
        oyentes.set(clave, set);
      }
      set.add(cb);
      // Otra pestaña del mismo usuario también mueve la memoria.
      window.addEventListener("storage", cb);
      return () => {
        set?.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    [clave],
  );
  const abierto = useSyncExternalStore(
    suscribir,
    () => leer(clave, defecto),
    () => defecto,
  );
  const escribir = useCallback(
    (v: boolean) => {
      try {
        localStorage.setItem(clave, JSON.stringify(v));
      } catch {
        // Sin storage: el `<details>` ya quedó abierto/cerrado en el DOM.
      }
      avisar(clave);
    },
    [clave],
  );
  return [abierto, escribir];
}
