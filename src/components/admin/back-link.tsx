"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

/**
 * Link de "regresar a la lista" de las páginas de detalle (fuente única).
 *
 * Si el usuario llegó navegando dentro del panel, regresa con
 * `router.back()` para CONSERVAR los query params de la lista (filtros del
 * server como `aeronave_id` y el estado de la tabla `tq`/`tp`). Si entró
 * directo (link externo, pestaña nueva), cae al `href` normal.
 */
interface BackLinkProps {
  /** Destino de respaldo cuando no hay historial propio al cual regresar. */
  href: string;
  children: React.ReactNode;
  /** Sobrescribe las clases del link (para páginas con variante text-sm). */
  className?: string;
  /** Sobrescribe las clases del icono (default h-3.5 w-3.5). */
  iconClassName?: string;
}

export function BackLink({
  href,
  children,
  className = "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
  iconClassName = "h-3.5 w-3.5",
}: BackLinkProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Clic con modificador o botón secundario: dejar el comportamiento
    // nativo del link (abrir en pestaña/ventana nueva con el href).
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }
    e.preventDefault();
    // Hay historial del mismo origen si el navegador registra más de una
    // entrada y no venimos referidos desde otro sitio.
    const mismoOrigen =
      !document.referrer ||
      document.referrer.startsWith(window.location.origin);
    if (window.history.length > 1 && mismoOrigen) {
      router.back();
    } else {
      router.push(href);
    }
  };

  return (
    <Link href={href} onClick={handleClick} className={className}>
      <ArrowLeftIcon className={iconClassName} />
      {children}
    </Link>
  );
}
