import { chipFacturaConcepto, type TonoChipFactura } from "@/lib/admin/conciliacion-factura-concepto";
import { cn } from "@/lib/utils";
import type { FacturaConceptoMovimiento } from "@/types/conciliacion";

const CLASE_TONO: Record<TonoChipFactura, string> = {
  neutro: "border-border text-muted-foreground",
  ok: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  aviso: "border-amber-500/40 text-amber-700 dark:text-amber-300",
};

/**
 * «Factura 7360» bajo la descripción de un movimiento (13-oct-2026, API
 * 0.0.75): el número lo lee el API; aquí solo se rotula con
 * `chipFacturaConcepto`. Verde = el gasto ligado tiene esa factura; ámbar =
 * no coincide o falta una (posible gasto equivocado); el 2.º chip ámbar dice
 * que la misma factura aparece en otro pago (posible pago doble). Abre
 * Conciliación en una pestaña NUEVA buscando el número (la tabla lee la
 * búsqueda al montar). Sin hooks: se puede pintar en el servidor.
 */
export function FacturaConceptoChip({
  fc,
  fecha,
  tipo,
}: {
  fc: FacturaConceptoMovimiento;
  fecha: string;
  tipo: string;
}) {
  const chip = chipFacturaConcepto(fc, { fecha, tipo });
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1" data-factura-concepto-fila="">
      <a
        href={chip.href}
        target="_blank"
        rel="noopener noreferrer"
        title={chip.titulo}
        aria-label={chip.ariaLabel}
        data-tono={chip.tono}
        className={cn(
          "inline-flex cursor-pointer items-center rounded border px-1.5 py-px text-[10px] font-medium hover:underline",
          CLASE_TONO[chip.tono],
        )}
      >
        {chip.texto}
      </a>
      {chip.repetida && (
        <span
          data-repetida=""
          title={chip.repetida.titulo}
          className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:text-amber-300"
        >
          {chip.repetida.texto}
        </span>
      )}
    </span>
  );
}
