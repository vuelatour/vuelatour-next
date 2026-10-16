import Link from "next/link";
import {
  ETIQUETA_QUITAR_RESALTADO,
  ETIQUETA_VOLVER_PRE_CIERRE,
  PREFIJO_FRANJA_PRE_CIERRE,
  TITULO_FRANJA_GENERICO,
  textoConteoResolver,
  type FocoPreCierre,
} from "@/lib/admin/pre-cierre-resolver";

/**
 * Franja ámbar que monta una pantalla cuando se llega desde «Resolver →» del
 * pre-cierre (PEDIDO 2, 15-oct-2026): QUÉ se viene a resolver, cuántos y
 * cuántos están en esta vista, con «Volver al pre-cierre →» y «Quitar
 * resaltado». Server-safe (sin hooks): la página la monta UNA vez, después de
 * la barra de filtros y de los avisos de degradación, antes de la tabla, solo
 * cuando `leerFocoPreCierre` ≠ null. Solo lectura: nada se resuelve solo.
 */
export function FranjaPreCierre({
  foco,
  encontrados,
  hrefQuitar,
  hrefVolver,
  notaVista,
}: {
  foco: FocoPreCierre;
  encontrados: number | null;
  hrefQuitar: string;
  hrefVolver: string;
  notaVista?: string | null;
}) {
  return (
    <div
      role="status"
      data-franja-pre-cierre={foco.clave}
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1"
    >
      <p className="font-medium">
        {PREFIJO_FRANJA_PRE_CIERRE} {foco.titulo ?? TITULO_FRANJA_GENERICO}
      </p>
      {foco.detalle && <p className="text-xs text-amber-700 dark:text-amber-300">{foco.detalle}</p>}
      {notaVista && <p className="text-xs text-amber-700 dark:text-amber-300">{notaVista}</p>}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span data-conteo="">{textoConteoResolver(foco, encontrados)}</span>
        <Link href={hrefVolver} className="cursor-pointer font-medium underline underline-offset-2">
          {ETIQUETA_VOLVER_PRE_CIERRE}
        </Link>
        <Link href={hrefQuitar} className="cursor-pointer font-medium underline underline-offset-2">
          {ETIQUETA_QUITAR_RESALTADO}
        </Link>
      </p>
    </div>
  );
}
