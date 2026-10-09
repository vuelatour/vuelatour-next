import { Badge } from "@/components/ui/badge";
import { estadoBancoGasto } from "@/lib/admin/conciliacion-estado";
import type { Gasto } from "@/types/expenses";

/**
 * Columna «Banco» de Gastos (9-oct-2026): ¿el gasto ya cruzó con el estado
 * de cuenta? Conciliado / Parcial / Sin conciliar; «—» en pagos que no se
 * concilian. Solo lectura: el cruce se hace en Conciliación.
 */
export function BancoBadge({ gasto }: { gasto: Gasto }) {
  const e = estadoBancoGasto(gasto);
  if (e.value === "NO_APLICA") {
    return (
      <span className="text-xs text-muted-foreground" title={e.title}>
        {e.label}
      </span>
    );
  }
  return (
    <Badge variant="outline" className={e.cls} title={e.title}>
      {e.label}
    </Badge>
  );
}
