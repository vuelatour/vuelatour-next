import Link from "next/link";
import {
  ETIQUETA_QUITAR_RESALTADO,
  TITULO_FRANJA_GASTO_ENFOCADO,
  textoEstadoGastoEnfocado,
} from "@/lib/admin/gasto-enfocado";

/**
 * Franja ámbar de Gastos cuando se llega con `?gasto=` desde la liga «Ver el
 * gasto con el que se concilió» de Conciliación (27-oct-2026): dice que ese
 * gasto va primero y resaltado (o que no está en esta vista) y ofrece
 * «Quitar resaltado». Server-safe (sin hooks), misma forma que
 * `FranjaPreCierre`; la página la monta solo sin foco del pre-cierre.
 */
export function FranjaGastoEnfocado({
  encontrado,
  hrefQuitar,
}: {
  /** null = la lista no cargó (no se afirma nada). */
  encontrado: boolean | null;
  hrefQuitar: string;
}) {
  return (
    <div
      role="status"
      data-franja-gasto-enfocado={encontrado === null ? "sin-lista" : encontrado ? "en-vista" : "fuera"}
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1"
    >
      <p className="font-medium">{TITULO_FRANJA_GASTO_ENFOCADO}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span data-estado="">{textoEstadoGastoEnfocado(encontrado)}</span>
        <Link href={hrefQuitar} className="cursor-pointer font-medium underline underline-offset-2">
          {ETIQUETA_QUITAR_RESALTADO}
        </Link>
      </p>
    </div>
  );
}
