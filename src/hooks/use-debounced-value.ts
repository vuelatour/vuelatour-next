"use client";

import { useEffect, useState } from "react";

/**
 * Devuelve el valor después de `delay` ms sin cambios. Útil para
 * evitar disparar peticiones en cada keystroke del cotizador.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
