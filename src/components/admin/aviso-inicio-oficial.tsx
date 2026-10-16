import { InformationCircleIcon } from "@heroicons/react/24/outline";
import {
  esAntesDelInicio,
  textoAvisoAjuste,
  textoChipAntesDelInicio,
  textoFranjaAntesDelInicio,
  type InicioOficial,
} from "@/lib/admin/inicio-oficial";

/**
 * Piezas visuales del inicio oficial (16-oct-2026, API 0.0.84). Sin estado ni
 * hooks: sirven en Server y Client Components. Con `inicio = null` (o sin
 * motivo) no pintan nada.
 */

/** «El sistema arranca el 1-sep-2026; ajustamos el periodo…» (URL vieja). */
export function AvisoPeriodoAjustado({
  inicio,
  ajustado,
  className,
}: {
  inicio: InicioOficial;
  ajustado: boolean;
  className?: string;
}) {
  if (!inicio || !ajustado) return null;
  return (
    <p
      role="status"
      data-aviso-inicio-oficial="ajuste"
      className={`flex items-start gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 ${className ?? ""}`}
    >
      <InformationCircleIcon className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <span>{textoAvisoAjuste(inicio)}</span>
    </p>
  );
}

/** Franja arriba del detalle de un registro de antes del inicio. */
export function FranjaAntesDelInicio({
  fecha,
  inicio,
  className,
}: {
  fecha: string | null | undefined;
  inicio: InicioOficial;
  className?: string;
}) {
  if (!inicio || !esAntesDelInicio(fecha, inicio)) return null;
  return (
    <div
      role="note"
      data-franja-inicio-oficial
      className={`flex items-start gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 ${className ?? ""}`}
    >
      <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{textoFranjaAntesDelInicio(inicio)}</span>
    </div>
  );
}

/** Chip junto a una liga o fila de antes del inicio. */
export function ChipAntesDelInicio({
  fecha,
  inicio,
  className,
}: {
  fecha: string | null | undefined;
  inicio: InicioOficial;
  className?: string;
}) {
  if (!inicio || !esAntesDelInicio(fecha, inicio)) return null;
  return (
    <span
      data-chip-inicio-oficial
      className={`inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${className ?? ""}`}
    >
      {textoChipAntesDelInicio(inicio)}
    </span>
  );
}
