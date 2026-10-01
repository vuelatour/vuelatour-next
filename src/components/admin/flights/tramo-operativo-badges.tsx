import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AYUDA_OPERATIVO_CON_PAX,
  AYUDA_TRAMO_OPERATIVO,
  CHIP_OPERATIVO_CON_PAX,
  ETIQUETA_TRAMO_OPERATIVO,
  operativoConPasajeros,
  type EscalaOperativaRef,
} from "@/lib/admin/tramo-operativo";

/**
 * Marca de un tramo OPERATIVO (`solo_operativa`): «Operativo · no cotizado»
 * con su ayuda en el `title`. Nada si el tramo es del cliente. Textos en
 * `lib/admin/tramo-operativo.ts` (30-sep-2026, vuelo #364).
 */
export function TramoOperativoBadge({
  escala,
  className,
}: {
  escala: EscalaOperativaRef;
  className?: string;
}) {
  if (escala.solo_operativa !== true) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
        className,
      )}
      title={AYUDA_TRAMO_OPERATIVO}
      data-tramo-operativo=""
    >
      {ETIQUETA_TRAMO_OPERATIVO}
    </Badge>
  );
}

/**
 * Chip ÁMBAR: tramo operativo con pasajeros (dato legado como el del #364
 * antes de la corrección del API, o un tramo del cliente que el freno de
 * cronología dejó operativo). Avisa, nunca bloquea. Nunca en un vuelo con
 * `itinerario_operativo` (ahí la cotización es otra ruta a propósito).
 */
export function TramoOperativoConPaxBadge({
  escala,
  itinerarioOperativo,
  className,
}: {
  escala: EscalaOperativaRef;
  /** `vuelo.itinerario_operativo` (ausente = API previo ⇒ se evalúa). */
  itinerarioOperativo?: boolean | null;
  className?: string;
}) {
  if (!operativoConPasajeros(escala, { itinerarioOperativo })) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        className,
      )}
      title={AYUDA_OPERATIVO_CON_PAX}
      data-operativo-con-pax=""
    >
      ⚠ {CHIP_OPERATIVO_CON_PAX}
    </Badge>
  );
}
