"use client";

import { usePorPagar } from "@/components/admin/por-pagar-provider";
import { notaFechaPorPagar, type EstadoPago } from "@/lib/admin/gasto-por-pagar";

/**
 * Nota ámbar bajo «Fecha del gasto» (19-oct-2026, gastos «por pagar», API
 * 0.0.95): con la capacidad y una fecha futura dentro del tope, «Quedará POR
 * PAGAR…»; en «Verificar / editar» de un gasto que ya está por pagar, cómo
 * se marca pagado. Sin capacidad (API previo, fuera del Provider) no pinta
 * NADA: el formulario queda byte a byte como antes. El texto es de
 * `lib/admin/gasto-por-pagar.ts`.
 */
export function NotaFechaPorPagar({
  fecha,
  estadoGuardado = null,
}: {
  fecha: string | null | undefined;
  /** Solo «Verificar / editar»: el `estado_pago` del gasto guardado. */
  estadoGuardado?: EstadoPago | null;
}) {
  const capacidad = usePorPagar();
  const nota = notaFechaPorPagar(fecha, capacidad, estadoGuardado);
  if (!nota) return null;
  return (
    <p role="status" data-nota-por-pagar="" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
      {nota}
    </p>
  );
}
