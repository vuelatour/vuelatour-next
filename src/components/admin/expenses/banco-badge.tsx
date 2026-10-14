import { Badge } from "@/components/ui/badge";
import {
  abreDetalleBanco,
  estadoBancoGasto,
  tituloBancoConClic,
  type GastoParaBanco,
} from "@/lib/admin/conciliacion-estado";
import { etiquetaBotonBanco } from "@/lib/admin/gasto-banco";
import { cn } from "@/lib/utils";

/**
 * Columna «Banco» de Gastos (9-oct-2026): ¿el gasto ya cruzó con el estado
 * de cuenta? Conciliado / Parcial / Sin conciliar; «—» en pagos que no se
 * concilian.
 *
 * 13-oct-2026 («conciliación al revés», API 0.0.75): con `alAbrir` (solo
 * ADMIN/FACTURACION, o rol desconocido) el badge es un BOTÓN que abre la hoja
 * «Conciliación con el banco» (`gasto-banco-sheet.tsx`): mismo color, cursor
 * de mano, `aria-haspopup="dialog"` (↑/↓ con el foco ahí no mueven la fila
 * activa) y un nombre accesible que empieza con el texto visible. El «—»
 * nunca es botón. Sin `alAbrir` el marcado es el de siempre (el cruce sigue
 * viviendo en Conciliación). Sin «use client»: solo se pinta dentro de
 * componentes cliente.
 */
export function BancoBadge({
  gasto,
  alAbrir,
}: {
  gasto: GastoParaBanco & { fecha_gasto?: string | null };
  alAbrir?: (() => void) | null;
}) {
  const e = estadoBancoGasto(gasto);
  if (e.value === "NO_APLICA") {
    return (
      <span className="text-xs text-muted-foreground" title={e.title}>
        {e.label}
      </span>
    );
  }
  if (alAbrir && abreDetalleBanco(e.value)) {
    return (
      <Badge
        variant="outline"
        className={cn(e.cls, "cursor-pointer hover:bg-muted/60")}
        title={tituloBancoConClic(e)}
        render={
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={etiquetaBotonBanco(e, gasto)}
            onClick={alAbrir}
          />
        }
      >
        {e.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={e.cls} title={e.title}>
      {e.label}
    </Badge>
  );
}
