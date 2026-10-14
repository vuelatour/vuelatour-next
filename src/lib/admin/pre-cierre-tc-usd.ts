/**
 * Pre-cierre: «Gastos en dólares conciliados con un tipo de cambio fuera de
 * lugar» (13-oct-2026, API 0.0.75, NO bloquea). PURO (prueba
 * `__tests__/pre-cierre-tc-usd.test.ts`).
 *
 * El API revisa cada gasto USD conciliado del periodo contra el T.C. OFICIAL
 * del día de su cargo en pesos (±2 % o fuera de la banda 15–25 ⇒ casi seguro
 * es OTRO cargo, y el T.C. que derivó la BD mueve los pesos del gasto en el
 * balance y el reparto) y manda cada liga ya redactada (`texto`). Aquí solo
 * se arman los renglones con sus DOS enlaces: el cargo en Conciliación
 * (pestaña conciliados, su cuenta y su día) y el vuelo del gasto (o Gastos de
 * ese día). Nada se corrige solo.
 */

import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import type { LigaUsdTcPreCierre } from "@/types/conciliacion";

/** COPIA de la clave del API (`ligas-usd-tc-precierre.util.ts`). */
export const CLAVE_PRECIERRE_LIGAS_USD_TC = "gastos_usd_tc_fuera_de_lugar";

export const ETIQUETA_VER_CARGO = "Ver el cargo";

/** Renglones visibles antes de «y N más…». */
export const MAX_LIGAS_USD_TC = 8;

export interface LineaLigaUsdTc {
  key: string;
  /** El renglón del API tal cual. */
  texto: string;
  /** El detalle exacto del T.C. (tooltip). */
  titulo: string;
  /** Conciliación · conciliados · cuenta y día del cargo. */
  hrefConciliacion: string;
  /** El vuelo del gasto o, sin vuelo, Gastos de ese día. */
  hrefGasto: string;
  /** «Ver el vuelo #345» / «Ver el gasto». */
  etiquetaGasto: string;
}

/** «Resolver →» del renglón: Conciliación, pestaña conciliados, del periodo. */
export function hrefLigasUsdTcPeriodo(p: { desde: string; hasta: string }): string {
  return hrefConciliacion({ f: "conciliados", desde: p.desde, hasta: p.hasta });
}

/**
 * Los renglones de las ligas (hasta `max`) y cuántas quedan fuera contra el
 * `count` del API (el total real, no el largo del arreglo).
 */
export function lineasLigasUsdTc(
  ligas: readonly LigaUsdTcPreCierre[] | null | undefined,
  count: number | null | undefined,
  max = MAX_LIGAS_USD_TC,
): { lineas: LineaLigaUsdTc[]; restantes: number } {
  const lista = (Array.isArray(ligas) ? ligas : []).filter(
    (l): l is LigaUsdTcPreCierre => !!l && typeof l.gasto_id === "string",
  );
  const lineas = lista.slice(0, max).map((l) => ({
    key: l.gasto_id,
    texto: l.texto,
    titulo: l.tc_cruce?.titulo ?? l.texto,
    hrefConciliacion: hrefConciliacion({
      f: "conciliados",
      cuenta: l.cuenta_bancaria_id,
      desde: l.fecha_cargo,
      hasta: l.fecha_cargo,
    }),
    hrefGasto: l.vuelo_id
      ? `/admin/flights/${l.vuelo_id}`
      : `/admin/expenses?desde=${l.fecha_gasto}&hasta=${l.fecha_gasto}`,
    etiquetaGasto: l.vuelo_folio ? `Ver el vuelo #${l.vuelo_folio}` : "Ver el gasto",
  }));
  const total = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : lista.length;
  return { lineas, restantes: Math.max(0, Math.max(total, lista.length) - lineas.length) };
}
