import Link from "next/link";
import { EyeIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import {
  ETIQUETA_VER_EN_PANTALLA,
  TITULO_VER_EN_PANTALLA,
  hrefVistaBalance,
  type DestinoVistaBalance,
} from "@/lib/admin/balance-vista";
import { cn } from "@/lib/utils";

/**
 * Enlace «Ver en pantalla» a `/admin/reportes/balance` (12-oct-2026): el
 * MISMO libro que descarga el botón de al lado, pero en pantalla. Fuente
 * única del enlace para la card de Reportes y el selector de avión.
 */
export function VerEnPantallaLink({
  destino,
  desde,
  hasta,
  className,
  "aria-label": ariaLabel,
}: {
  destino: DestinoVistaBalance;
  desde: string;
  hasta: string;
  className?: string;
  /**
   * Nombre accesible (ADITIVO, 12-oct-2026): con nueve enlaces «Ver en
   * pantalla» en la misma pantalla, cada uno dice de qué libro es
   * («Ver en pantalla · XB-PEV»). El texto visible no cambia.
   */
  "aria-label"?: string;
}) {
  return (
    <Link
      href={hrefVistaBalance(destino, desde, hasta)}
      title={TITULO_VER_EN_PANTALLA}
      aria-label={ariaLabel}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 cursor-pointer", className)}
    >
      <EyeIcon className="h-4 w-4" aria-hidden />
      {ETIQUETA_VER_EN_PANTALLA}
    </Link>
  );
}
