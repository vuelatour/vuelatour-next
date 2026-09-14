/**
 * Regla PURA del «ponerse al día al volver a la pestaña» (14-sep-2026).
 *
 * Caso del cliente: movió un gasto de vuelo desde Gastos y, al volver a la
 * pestaña del detalle del vuelo que ya tenía abierta, seguía viendo el
 * gasto en el vuelo viejo. El servidor ya estaba al día (las páginas son
 * `force-dynamic` + `cache: "no-store"`): lo viejo era la pestaña. Al
 * recuperar el foco se pide `router.refresh()`, con un mínimo entre
 * refrescos para no disparar N peticiones cuando el foco parpadea
 * (alt-tab rápido, diálogos del navegador).
 */
export const MIN_ENTRE_REFRESCOS_MS = 10_000;

export function debeRefrescarAlEnfocar(
  ultimoRefrescoMs: number | null,
  ahoraMs: number,
  minMs: number = MIN_ENTRE_REFRESCOS_MS,
): boolean {
  if (ultimoRefrescoMs == null) return true;
  return ahoraMs - ultimoRefrescoMs >= minMs;
}
