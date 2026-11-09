import { cn } from "@/lib/utils";
import {
  ETIQUETA_SE_RETIENE,
  ETIQUETA_SOLO_INFORMATIVA,
  TITULO_SE_RETIENE,
  TITULO_SOLO_INFORMATIVA,
} from "@/lib/admin/reparto-avion";

/**
 * Badge «se le retiene» / «solo informativa» de la reserva de overhaul de
 * un socio (sin hooks: también en la card). Desde el 6-nov-2026 (API 0.0.125,
 * invariante 121) a TODOS los socios se les descuenta —y desde el 9-nov-2026
 * (API 0.0.129) la reserva es una resta más de la cascada, antes del saldo a
 * repartir, y VuelaTour la retiene—: el interruptor por socio («Cambiar», `PATCH
 * /v1/aircraft/owners/:id`) se quitó. El badge sigue leyendo
 * `descuenta_reserva` porque un cierre cerrado antes conserva en su snapshot
 * a quién se le descontaba y a quién solo se le informaba.
 */
export function BadgeReservaSocio({ descuenta, className }: { descuenta: boolean; className?: string }) {
  return (
    <span
      data-reserva-socio={descuenta ? "descuenta" : "informativa"}
      title={descuenta ? TITULO_SE_RETIENE : TITULO_SOLO_INFORMATIVA}
      className={cn(
        "inline-flex items-center rounded border px-1.5 text-[10px] font-medium leading-tight",
        descuenta
          ? "border-brand-600/30 bg-brand-600/10 text-brand-600 dark:text-brand-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        className,
      )}
    >
      {descuenta ? ETIQUETA_SE_RETIENE : ETIQUETA_SOLO_INFORMATIVA}
    </span>
  );
}
