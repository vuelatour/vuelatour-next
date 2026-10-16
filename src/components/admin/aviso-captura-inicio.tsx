"use client";

import { useInicioOficial } from "./inicio-oficial-provider";
import { avisoCapturaAntesDelInicio } from "@/lib/admin/inicio-oficial";
import { cn } from "@/lib/utils";

/**
 * Aviso NO bloqueante bajo la fecha de una captura (16-oct-2026, inicio
 * oficial; mismo patrón que `avisoFechaAntesDelArranque` de las entregas a
 * socios): «La fecha es anterior al inicio oficial (1-sep-2026): se
 * guardará, pero no aparecerá en listados ni reportes.» El API acepta la
 * fecha (la cola offline de la app tiene capturas fechadas): aquí solo se
 * dice ANTES de guardar. Sin inicio, o con una fecha desde el inicio, nada.
 */
export function AvisoCapturaAntesDelInicio({
  fecha,
  className,
}: {
  /** Día «AAAA-MM-DD» o instante ISO (se pasa a día Cancún). */
  fecha: string | null | undefined;
  className?: string;
}) {
  const inicio = useInicioOficial();
  const aviso = avisoCapturaAntesDelInicio(fecha, inicio);
  if (!aviso) return null;
  return (
    <p
      role="status"
      data-aviso-captura-inicio
      className={cn("mt-1 text-xs text-amber-600 dark:text-amber-400", className)}
    >
      {aviso}
    </p>
  );
}
