"use client";

import { useEffect, useRef, useState } from "react";

/**
 * «No perder cambios» (edición directa del cotizador, 8-sep-2026).
 *
 * Con `activo` (form sucio):
 * - `beforeunload` avisa al cerrar/recargar la pestaña (diálogo nativo del
 *   navegador: es el único que existe ahí).
 * - Los clics en links INTERNOS (Next `<Link>` o `<a>` del mismo origen) se
 *   interceptan en fase de captura y se guardan en `navPendiente` para que el
 *   componente muestre SU confirmación (AlertDialog) y navegue con
 *   `confirmarNav()` — regla del cliente: toda acción que tira trabajo pide
 *   confirmación.
 * - `saltar()` desactiva el aviso para una salida deliberada (p. ej.
 *   «Recargar conservando borrador»).
 */
export function useCambiosSinGuardar(activo: boolean) {
  const [navPendiente, setNavPendiente] = useState<string | null>(null);
  const saltarRef = useRef(false);

  useEffect(() => {
    if (!activo) return;
    saltarRef.current = false;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saltarRef.current) return;
      e.preventDefault();
      // Requisito legado de algunos navegadores para mostrar el aviso.
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (saltarRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return; // misma página (anclas): no es salir
      }
      e.preventDefault();
      e.stopPropagation();
      setNavPendiente(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [activo]);

  return {
    /** Destino interno al que el operador quiso ir con cambios sin guardar. */
    navPendiente,
    cancelarNav: () => setNavPendiente(null),
    /** Deja pasar la siguiente salida (recarga/asignación deliberada). */
    saltar: () => {
      saltarRef.current = true;
    },
    limpiarNav: () => setNavPendiente(null),
  };
}
