import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
  TEXTO_PESTANA_NUEVA_SR,
  hayEnlacesBalance,
  type EnlaceBalanceGasto,
  type EnlacesBalanceDeGasto,
} from "@/lib/admin/conciliacion-balance";

const CLASE_ENLACE =
  "mr-2 inline-flex cursor-pointer items-center gap-0.5 text-sky-700 hover:underline dark:text-sky-400";

function EnlaceBalance({ enlace }: { enlace: EnlaceBalanceGasto }) {
  return (
    <a href={enlace.href} target="_blank" rel="noopener noreferrer" title={enlace.title} className={CLASE_ENLACE}>
      <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden />
      {enlace.etiqueta}
      <span className="sr-only">{TEXTO_PESTANA_NUEVA_SR}</span>
    </a>
  );
}

/**
 * «Ver en balance del avión N4142R · Ver en balance general» bajo un gasto
 * ligado de Conciliación (13-oct-2026, API 0.0.75, punto 5). Textos y URLs
 * de `lib/admin/conciliacion-balance.ts`; sin enlaces no pinta nada (el
 * marcado de la celda queda el de siempre).
 *
 * `<a>` NATIVO y no `<Link>`: una pestaña nueva no usa la caché del router y
 * así no hay prefetch por cada fila visible. Va como HERMANO del `<Link>` de
 * la línea del gasto, NUNCA dentro: un `<a>` dentro de otro es HTML inválido.
 * Sin hooks.
 */
export function EnlacesBalanceGasto({ enlaces }: { enlaces: EnlacesBalanceDeGasto }) {
  if (!hayEnlacesBalance(enlaces)) return null;
  return (
    <span className="block text-[10px] leading-4" data-enlaces-balance="">
      {enlaces.aviones.map((e) => (
        <EnlaceBalance key={e.key} enlace={e} />
      ))}
      {enlaces.masAviones ? (
        <span className="mr-2 text-muted-foreground" title={enlaces.masAviones.title}>
          {enlaces.masAviones.texto}
        </span>
      ) : null}
      {enlaces.general ? <EnlaceBalance enlace={enlaces.general} /> : null}
    </span>
  );
}
