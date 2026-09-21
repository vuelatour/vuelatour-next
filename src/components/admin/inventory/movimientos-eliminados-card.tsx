import { TZ_LABEL } from "@/lib/datetime";
import {
  autorEliminado,
  gastosEliminadosTxt,
  resumenEliminado,
  TEXTO_HISTORIAL_NO_CARGO,
  tituloHistorial,
} from "@/lib/admin/inventario-eliminar";
import type { MovimientoEliminado } from "@/types/inventory";

/**
 * Bitácora de los movimientos de cardex que se ELIMINARON de este ítem
 * (21-sep-2026): fecha, tipo, cantidad, avión, QUIÉN lo eliminó, CUÁNDO (hora
 * de Cancún) y el MOTIVO — que es exactamente lo que pidió el cliente
 * («que al momento de eliminarlos pida justificación y sepamos quién lo
 * hizo»). Plegada: es historia, no operación del día.
 *
 * Sin filas NO se pinta nada… salvo que la lectura haya FALLADO: entonces se
 * dice. Pintar «no hay eliminados» cuando no se pudo leer sería mentir.
 */
export function MovimientosEliminadosCard({
  filas,
  falla = false,
  unidad,
}: {
  filas: MovimientoEliminado[];
  /** La lectura del historial falló (no es que no haya). */
  falla?: boolean;
  unidad?: string | null;
}) {
  if (falla) {
    return (
      <p className="text-sm text-muted-foreground">{TEXTO_HISTORIAL_NO_CARGO}</p>
    );
  }
  if (filas.length === 0) return null;

  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium hover:bg-muted/50">
        {tituloHistorial(filas.length)}
        <span className="ml-2 font-normal text-muted-foreground">
          quién, cuándo y por qué
        </span>
      </summary>
      <ul className="space-y-3 border-t px-4 py-3">
        {filas.map((f) => (
          <li key={f.id} className="text-sm">
            <p className="font-medium">{resumenEliminado(f, unidad)}</p>
            <p className="text-xs text-muted-foreground">
              {autorEliminado(f)} · {gastosEliminadosTxt(f)}
            </p>
            {/* El motivo es el corazón del pedido: se pinta completo, sin
                recortar, y con comillas para que se lea como lo escribieron. */}
            <p className="mt-1 whitespace-pre-line text-muted-foreground">
              «{f.motivo}»
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        Fechas y horas en {TZ_LABEL}.
      </p>
    </details>
  );
}
