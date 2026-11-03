"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { debeRefrescarAlEnfocar, hayCapturaAbierta } from "@/lib/admin/refresh-on-focus";

/**
 * Pone al día la página al VOLVER a la pestaña (14-sep-2026).
 *
 * Todo el panel se sirve fresco del API en cada render (`force-dynamic`,
 * `cache: "no-store"`), pero una pestaña que ya estaba abierta no se
 * vuelve a pedir sola: la oficina movía un gasto de vuelo en Gastos y, al
 * regresar a la pestaña del detalle del vuelo, seguía viendo la lista
 * vieja hasta recargar. Ahora, al recuperar el foco (o volver a ser
 * visible), se pide `router.refresh()`: re-renderiza los Server Components
 * de la ruta actual. Mínimo 10 s entre refrescos (foco que parpadea). Con
 * un diálogo, panel lateral o alerta abiertos NO se refresca (3-nov-2026):
 * la tabla se volvería a pintar con objetos nuevos y los diálogos que
 * reinician su formulario por identidad de la fila perderían lo capturado
 * (así se «perdían» los datos fiscales del cliente al volver del selector
 * de archivos de la constancia); ver `hayCapturaAbierta`. Se monta UNA vez
 * en el layout de /admin.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  const ultimo = useRef<number | null>(null);

  useEffect(() => {
    // Recién montado cuenta como refrescado (la ruta acaba de pedirse): el
    // primer foco dentro del mínimo no la vuelve a pedir. Aquí y no en el
    // render (`Date.now()` es impuro para el React Compiler).
    ultimo.current = Date.now();
    const refrescar = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // Capturando (diálogo/panel/alerta abiertos): el refresh espera al
      // siguiente foco sin diálogo, sin consumir el mínimo entre refrescos.
      if (hayCapturaAbierta(document)) return;
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
