"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { abrePorHash } from "@/lib/admin/inventario-ficha";

/**
 * Sección plegable del fondo de la ficha del producto (25-sep-2026): «Empaques
 * y fotos» y «Cardex completo». Pedido del cliente: la ficha debe ser SOLO
 * Compras | Ventas | Resumen; lo demás no se pierde, solo deja de estorbar.
 *
 * - `<details>` nativo, CERRADO por defecto y SIN memoria (nada de
 *   localStorage: cada visita abre limpia).
 * - El contenido está SIEMPRE montado: los diálogos de «Editar costo» y
 *   «Eliminar movimiento» viven adentro y se abren aunque la sección esté
 *   cerrada.
 * - Se abre sola si la URL apunta a su ancla (`#cardex`, `#empaques-fotos`)
 *   al montar Y cuando cambia el hash en la MISMA página: un
 *   `<a href="#cardex">` no remonta nada, y sin el listener el enlace solo
 *   haría scroll a una sección cerrada. También al pulsar un enlace a su
 *   ancla con el hash YA puesto (segunda vez: no hay `hashchange`).
 */
export function FichaPlegable({
  id,
  titulo,
  resumen,
  children,
}: {
  /** Id y ancla de la sección. */
  id: string;
  titulo: string;
  /** Texto tenue junto al título («2 empaques · 3 fotos»). */
  resumen?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const abrirSiToca = () => {
      const el = ref.current;
      if (!el || !abrePorHash(window.location.hash, id)) return;
      el.open = true;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    // Clic en un enlace a ESTA ancla con el hash ya puesto (se abrió, el
    // operador la cerró y vuelve a pulsar «Abrir el cardex…»): el hash no
    // cambia, `hashchange` no llega y el enlace solo haría scroll a la
    // sección cerrada. Se abre aquí, antes del scroll del navegador.
    const alClic = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      const el = ref.current;
      if (!a || !el || !abrePorHash(a.getAttribute("href"), id)) return;
      el.open = true;
    };
    abrirSiToca();
    window.addEventListener("hashchange", abrirSiToca);
    document.addEventListener("click", alClic);
    return () => {
      window.removeEventListener("hashchange", abrirSiToca);
      document.removeEventListener("click", alClic);
    };
  }, [id]);

  return (
    <details ref={ref} id={id} className="group scroll-mt-24 rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <span>{titulo}</span>
        {resumen ? (
          <span className="font-normal text-muted-foreground">· {resumen}</span>
        ) : null}
      </summary>
      <div className="space-y-4 border-t p-4">{children}</div>
    </details>
  );
}
