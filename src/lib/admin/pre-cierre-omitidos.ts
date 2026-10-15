/**
 * Pre-cierre: «Movimientos del banco omitidos de la conciliación» (14-oct-2026,
 * API 0.0.77, invariante 75; INFORMATIVO, no bloquea). PURO (prueba
 * `__tests__/pre-cierre-omitidos.test.ts`).
 *
 * El API cuenta los omitidos del periodo por la FECHA del movimiento
 * (`omitidosDelPeriodo`, `[desde, hasta]`), con su monto por moneda de la
 * cuenta, y redacta el detalle («14 movimientos del banco se marcaron como
 * «no se concilian» con un motivo (…): revisa en Conciliación → Omitidos que
 * ninguno sea un gasto sin capturar.»). Aquí solo el ENLACE a esa pestaña CON
 * EL PERIODO (la página filtra por la misma `fecha`): sin las fechas,
 * «Omitidos (N)» enseñaría todo el histórico y no cuadraría con el «· N» del
 * renglón. Es informativo (no hay nada que «resolver»): el enlace dice
 * «Revisar los omitidos →». Revisión del 15-oct-2026: el API ya mandaba el
 * renglón y el panel lo pintaba sin enlace.
 */

import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";

/** COPIA de la clave del API (`renglonOmitidosPreCierre`, profit-sharing.service.ts). */
export const CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS = "movimientos_omitidos";

/** El texto del enlace del renglón (en vez de «Resolver →»). */
export const ETIQUETA_REVISAR_OMITIDOS = "Revisar los omitidos →";

/** Conciliación → «Omitidos» del periodo (`?f=omitidos&desde=…&hasta=…`). */
export function hrefPrecierreMovimientosOmitidos(p: { desde: string; hasta: string }): string {
  return hrefConciliacion({ f: "omitidos", desde: p.desde, hasta: p.hasta });
}
