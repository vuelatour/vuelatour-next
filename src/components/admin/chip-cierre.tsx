import { LockClosedIcon } from "@heroicons/react/24/outline";
import {
  tonoMarcaCierre,
  type BadgeEstadoCierre,
  type TonoEstadoCierre,
  type TonoMarcaCierre,
} from "@/lib/admin/cierre-mes";

/**
 * Chips del cierre de mes (16-oct-2026, API 0.0.88). Sin estado ni hooks:
 * sirven en Server y Client Components. El TEXTO es siempre el del API
 * (`cierre_marca` / `leyenda`): el panel solo elige el color por cómo
 * arranca («Pasa a…» ámbar, «Viene de…» azul, «Pendiente de cobro…» y
 * «Pasará a… · cobrado el 14-oct, después del 30-sep» ámbar claro); un
 * texto que no reconoce no se pinta (API distinto ⇒ nada raro).
 */

const CLASE_BASE =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight";

export const CLASE_POR_TONO: Record<TonoMarcaCierre | "cerrado", string> = {
  pasa: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  pasaria: "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300",
  viene: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  cerrado: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/** Chip por `cierre_marca` (reparto, balance, pre-cierre). Sin marca reconocible ⇒ nada. */
export function ChipMarcaCierre({
  marca,
  className,
  title,
}: {
  marca: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const tono = tonoMarcaCierre(marca);
  if (!tono) return null;
  return (
    <span data-chip-cierre={tono} title={title} className={`${CLASE_BASE} ${CLASE_POR_TONO[tono]} ${className ?? ""}`}>
      {marca}
    </span>
  );
}

/** Chip con tono explícito (detalle del vuelo, badge del periodo). */
export function ChipCierre({
  tono,
  texto,
  title,
  className,
}: {
  tono: TonoMarcaCierre | "cerrado";
  texto: string;
  title?: string;
  className?: string;
}) {
  return (
    <span data-chip-cierre={tono} title={title} className={`${CLASE_BASE} ${CLASE_POR_TONO[tono]} ${className ?? ""}`}>
      {texto}
    </span>
  );
}

const CLASE_POR_ESTADO: Record<TonoEstadoCierre, string> = {
  abierto: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  cerrado: CLASE_POR_TONO.cerrado,
  reabierto: CLASE_POR_TONO.pasa,
  "en-curso": "border-border bg-muted text-muted-foreground",
};

/** Badge del ESTADO del mes («Abierto», «Cerrado el 16-oct-2026 por Ale»…). */
export function ChipEstadoCierre({ badge, className }: { badge: BadgeEstadoCierre | null; className?: string }) {
  if (!badge) return null;
  return (
    <span data-estado-cierre={badge.tono} className={`${CLASE_BASE} ${CLASE_POR_ESTADO[badge.tono]} ${className ?? ""}`}>
      {badge.tono === "cerrado" && <LockClosedIcon className="mr-1 h-3 w-3" aria-hidden />}
      {badge.texto}
    </span>
  );
}
