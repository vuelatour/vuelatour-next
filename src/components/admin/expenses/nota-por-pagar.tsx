"use client";

import { usePorPagar } from "@/components/admin/por-pagar-provider";
import {
  capacidadFechaCaptura,
  errorFechaFuturaConCargos,
  notaFechaPorPagar,
  type EstadoPago,
} from "@/lib/admin/gasto-por-pagar";
import {
  NOTA_REFACCION_POR_PAGAR_SIN_AVION,
  errorInventarioFechaFutura,
} from "@/lib/admin/refaccion-inventario";

/**
 * Nota ámbar bajo «Fecha del gasto» (19-oct-2026, gastos «por pagar», API
 * 0.0.95): con la capacidad y una fecha futura dentro del tope, «Quedará POR
 * PAGAR…»; en «Verificar / editar» de un gasto que ya está por pagar, cómo
 * se marca pagado. Sin capacidad (API previo, fuera del Provider) no pinta
 * NADA: el formulario queda byte a byte como antes. El texto es de
 * `lib/admin/gasto-por-pagar.ts`.
 *
 * Un gasto que YA está pagado nunca queda «por pagar» (revisión del lote,
 * 19-oct-2026): con `conciliado` (el banco prueba el pago) no hay nota, y
 * con `conCargos` («Créalo por la suma»: el cargo ES el pago) una fecha
 * futura es un ERROR que se dice aquí (y el alta no deja guardar).
 */
export function NotaFechaPorPagar({
  fecha,
  estadoGuardado = null,
  conCargos = false,
  conciliado = false,
}: {
  fecha: string | null | undefined;
  /** Solo «Verificar / editar»: el `estado_pago` del gasto guardado. */
  estadoGuardado?: EstadoPago | null;
  /** «Créalo por la suma» de Conciliación: nace ligado a cargos del banco. */
  conCargos?: boolean;
  /** «Verificar / editar» de un gasto conciliado con el banco. */
  conciliado?: boolean;
}) {
  const capacidad = usePorPagar();
  const error = conCargos ? errorFechaFuturaConCargos(fecha, capacidad) : null;
  if (error) {
    return (
      <p role="alert" data-error-fecha-con-cargos="" className="mt-1 text-xs text-destructive dark:text-red-400">
        {error}
      </p>
    );
  }
  const nota = notaFechaPorPagar(fecha, capacidadFechaCaptura(capacidad, { conCargos, conciliado }), estadoGuardado);
  if (!nota) return null;
  return (
    <p role="status" data-nota-por-pagar="" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
      {nota}
    </p>
  );
}

/**
 * Refacción «A Inventario/Tienda» con fecha futura (acuerdo 4 del lote): el
 * texto EXACTO del API (`INVENTARIO_FECHA_FUTURA`) dentro del bloque del
 * destino, para que se vea ANTES de pulsar «Guardar» (que tampoco deja
 * guardar). Debajo, en su propio renglón, la salida real cuando todavía no
 * se sabe a qué avión va (texto PROPIO del panel, segunda revisión del
 * lote: «Directo al avión» exige el avión y cada aviso mandaba al otro).
 * Sin la capacidad o con fecha ≤ hoy no pinta nada.
 */
export function AvisoInventarioFechaFutura({ fecha }: { fecha: string | null | undefined }) {
  const capacidad = usePorPagar();
  const error = errorInventarioFechaFutura({ destino: "INVENTARIO", fecha, capacidad });
  if (!error) return null;
  return (
    <div
      role="alert"
      data-error-inventario-fecha-futura=""
      className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive dark:text-red-400"
    >
      <p>{error}</p>
      <p data-salida-inventario-fecha-futura="" className="text-foreground">
        {NOTA_REFACCION_POR_PAGAR_SIN_AVION}
      </p>
    </div>
  );
}
