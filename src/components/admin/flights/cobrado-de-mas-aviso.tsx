import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ETIQUETA_QUE_HACER, presentacionCobradoDeMas } from "@/lib/admin/cobrado-de-mas";
import { cn } from "@/lib/utils";
import type { CobradoDeMasVuelo } from "@/types/flights";

/**
 * «COBRADO DE MÁS» en la card de cobros del vuelo y en la de la cotización
 * (14-oct-2026, API 0.0.78, invariante 77). Pinta `snapshot.cobrado_de_mas`
 * TAL CUAL lo arma el API (excedente, causa probable y qué hacer): AVISO =
 * caja ámbar visible (no un tooltip) con «Qué hacer» y, si la causa es el
 * pago de otro vuelo del cliente, el enlace a ese vuelo; INFO (comisión del
 * link, redondeo del T.C.) = una línea gris. null/ausente ⇒ nada: jamás se
 * calcula en el panel. Sin hooks: sirve en las dos cards.
 */
export function CobradoDeMasAviso({
  aviso,
  className,
}: {
  aviso: CobradoDeMasVuelo | null | undefined;
  className?: string;
}) {
  const p = presentacionCobradoDeMas(aviso);
  if (!p) return null;
  if (p.tono === "INFO") {
    return (
      <p className={cn(p.clases, className)} data-cobrado-de-mas="info">
        {p.sinTc ? `${p.linea} ${p.sinTc}` : p.linea}
      </p>
    );
  }
  return (
    <div role="status" className={cn(p.clases, "space-y-1", className)} data-cobrado-de-mas="aviso">
      <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
        {p.titulo}
      </p>
      {p.cuerpo && <p>{p.cuerpo}</p>}
      {p.sinTc && <p className="text-muted-foreground">{p.sinTc}</p>}
      {p.queHacer && (
        <p>
          <span className="font-medium">{ETIQUETA_QUE_HACER}</span>
          {` ${p.queHacer}`}
        </p>
      )}
      {p.enlace && (
        <p>
          <Link
            href={p.enlace.href}
            className="cursor-pointer font-medium underline underline-offset-2 hover:opacity-80"
          >
            {p.enlace.texto}
          </Link>
        </p>
      )}
    </div>
  );
}
