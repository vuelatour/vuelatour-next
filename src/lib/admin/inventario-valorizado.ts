import { fmtMxn, fmtTc, fmtUsd } from "@/lib/format";

/**
 * Valorizado de la bodega: JAMÁS un USD sumado como MXN (22-sep-2026).
 *
 * Reporte del cliente sobre la hoja «inventario» del Balance general: «Aceite
 * 15w 50 · 30 · $3,300.00 MXN» cuando la única entrada fueron 30 × 110 **USD**
 * sin tipo de cambio. En producción 67 de las 68 ENTRADAs (la carga
 * VTF-INV-001 del 29-ago) están así, o sea casi toda la bodega.
 *
 * El API (invariante 8, `inventario-cardex.util.ts#statsFromLayers`) separó
 * el valorizado en DOS campos que NUNCA se suman entre sí:
 *   · `valor_mxn` / `valor_total_mxn` → SOLO capas con pesos REALES (compra
 *     en MXN, o USD con T.C. capturado). **Cambió de significado**: antes
 *     traía también los dólares crudos.
 *   · `valor_usd_sin_tc` / `valor_total_usd_sin_tc` (ADITIVOS) → lo comprado
 *     en dólares que todavía no tiene T.C., EN DÓLARES.
 *   · `pesos_exactos` (ADITIVO) → `valor_mxn` ya es TODO el valorizado.
 *
 * Sin ese desglose el panel pintaría «$0.00 MXN» para casi cada producto: no
 * es mentira, pero es MUDO — y el operador acaba de reportar justo lo
 * contrario (un número que no era el suyo). Aquí se redacta una sola vez qué
 * se pinta en cada caso.
 *
 * SKEW DE DEPLOY: con un API previo (`valor_usd_sin_tc` ausente) todo se
 * comporta EXACTAMENTE como antes — se pinta el monto en pesos tal cual.
 * Nada se adivina: `pesos_exactos` ausente NO significa «hay dólares».
 */

/** Aviso al pie de la cifra cuando parte del valor está en dólares sin T.C. */
export const NOTA_VALOR_SIN_TC =
  "Parte del valor está en dólares sin tipo de cambio: se muestra en su " +
  "moneda y no entra al total en pesos. Captura el T.C. de esas entradas " +
  "(«Editar costo» en el cardex) para verlo en pesos.";

/** Tooltip corto para las cifras que traen las dos monedas. */
export const TITULO_VALOR_SIN_TC =
  "Pesos reales + dólares sin tipo de cambio (nunca se suman entre sí)";

export interface ValorizadoPartes {
  /** Valorizado en pesos REALES (ya sin los dólares crudos). */
  mxn: number | null | undefined;
  /** Valorizado en dólares SIN T.C. Ausente = API previo. */
  usdSinTc?: number | null;
  /** `mxn` es todo el valorizado. Ausente = API previo. */
  pesosExactos?: boolean | null;
}

/**
 * ¿Esta cifra lleva una parte en dólares sin T.C.? Solo cuando el API mandó
 * el desglose Y hay algo que mostrar en él: un 0 no se anuncia (sería una
 * nota permanente en una bodega 100 % en pesos).
 */
export function tieneUsdSinTc(v: ValorizadoPartes): boolean {
  return typeof v.usdSinTc === "number" && v.usdSinTc !== 0;
}

/**
 * Cifra del valorizado, en es-MX y con cada moneda en su sitio:
 *   · sin dólares            → «$3,500.00 MXN»   (idéntico a antes)
 *   · solo dólares sin T.C.  → «$1,785 USD (sin T.C.)»
 *   · mixto                  → «$2,000.00 MXN + $200 USD (sin T.C.)»
 * Nunca un «$0.00 MXN» mudo cuando el valor real vive en dólares, y la
 * moneda va SIEMPRE escrita: `fmtUsd` y `fmtMxn` usan el mismo símbolo «$».
 */
export function textoValorizado(v: ValorizadoPartes): string {
  const mxn = typeof v.mxn === "number" && Number.isFinite(v.mxn) ? v.mxn : null;
  if (!tieneUsdSinTc(v)) return fmtMxn(mxn);
  const usd = `${fmtUsd(v.usdSinTc)} USD (sin T.C.)`;
  // Con 0 pesos reales el «$0.00 MXN +» no aporta y hace ilegible la cifra:
  // lo que vale la bodega está del otro lado.
  if (mxn == null || mxn === 0) return usd;
  return `${fmtMxn(mxn)} + ${usd}`;
}

/**
 * Valorizado de la bodega con su REGLA (25-sep-2026, API 0.0.36): existencia
 * × último precio de compra, al T.C. oficial de HOY (el mismo de las
 * cotizaciones). El remanente viejo se revalúa al precio nuevo, como pidió
 * el cliente («el remanente que teníamos de agosto ahora igual su costo de
 * 30 DLS»), y la cifra se mueve cada día con el T.C.
 *
 *   · API 0.0.36 con T.C. de hoy → «valorizado $1,385,535.56 MXN (último
 *     precio de compra · T.C. de hoy 17.6729)»
 *   · API 0.0.36 sin T.C. de hoy → «valorizado $X (último precio de compra)»
 *   · API previo (sin `reglaCosto`) → «valorizado $X (FIFO)», como antes: ahí
 *     el costo SÍ era FIFO y decir otra cosa sería mentir.
 *
 * La cifra sigue siendo `textoValorizado` (cada moneda en su sitio).
 */
export function textoValorizadoConTc(
  v: ValorizadoPartes,
  opts: { tcHoy?: number | null; reglaCosto?: string | null } = {},
): string {
  const cifra = textoValorizado(v);
  if (!opts.reglaCosto) return `valorizado ${cifra} (FIFO)`;
  const tc = fmtTc(opts.tcHoy);
  return tc
    ? `valorizado ${cifra} (último precio de compra · T.C. de hoy ${tc})`
    : `valorizado ${cifra} (último precio de compra)`;
}
