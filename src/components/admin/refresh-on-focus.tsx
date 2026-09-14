"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { debeRefrescarAlEnfocar } from "@/lib/admin/refresh-on-focus";

/**
 * Pone al día la página al VOLVER a la pestaña (14-sep-2026).
 *
 * Todo el panel se sirve fresco del API en cada render (`force-dynamic`,
 * `cache: "no-store"`), pero una pestaña que ya estaba abierta no se
 * vuelve a pedir sola: la oficina movía un gasto de vuelo en Gastos y, al
 * regresar a la pestaña del detalle del vuelo, seguía viendo la lista
 * vieja hasta recargar. Ahora, al recuperar el foco (o volver a ser
 * visible), se pide `router.refresh()`: re-renderiza los Server Components
 * de la ruta actual sin perder el estado de los formularios abiertos.
 * Mínimo 10 s entre refrescos (foco que parpadea). Se monta UNA vez en el
 * layout de /admin.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  const ultimo = useRef<number | null>(Date.now());

  useEffect(() => {
    const refrescar = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!debeRefrescarAlEnfocar(ultimo.current, ahora)) return;
      ultimo.current = ahora;
      router.refresh();
    };
    window.addEventListener("focus", refrescar);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.removeEventListener("focus", refrescar);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router]);

  return null;
}
