import type { EstadoCobroSemaforo } from "@/lib/admin/cobros";
import { cn } from "@/lib/utils";

/**
 * Semáforo de cobro para tablas (vuelos y cotizaciones): pill con punto de
 * color, mismo lenguaje visual que el semáforo de facturación de gastos.
 * FUENTE ÚNICA de estilos — la regla vive en estadoCobroSemaforo().
 */
const DOT: Record<string, string> = {
  COBRADO: "bg-emerald-500",
  PARCIAL: "bg-amber-400",
  SIN_COBROS: "bg-red-500",
  NO_APLICA: "bg-muted-foreground/40",
};

const PILL: Record<string, string> = {
  COBRADO:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PARCIAL:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  SIN_COBROS: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  NO_APLICA: "border-border bg-muted/30 text-muted-foreground",
};

export function CobroEstadoBadge({ estado }: { estado: EstadoCobroSemaforo }) {
  return (
    <span
      title={estado.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        PILL[estado.key],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[estado.key])} />
      {estado.label}
    </span>
  );
}
