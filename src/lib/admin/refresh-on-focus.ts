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

/**
 * Con un diálogo, panel lateral o alerta abiertos NO se refresca
 * (3-nov-2026): la oficina está capturando (acaba de volver del selector de
 * archivos de «Subir constancia», o de WhatsApp con el RFC) y un refresh
 * vuelve a pintar la tabla con objetos nuevos; los diálogos que reinician su
 * formulario por identidad de la fila perderían lo capturado (así se
 * «perdían» los datos fiscales del cliente). Además, lo fresco no se ve
 * detrás del diálogo. El siguiente foco sin diálogo sí refresca: el mínimo
 * entre refrescos no se consume. Dialog, Sheet y AlertDialog de Base UI
 * pintan estos roles; los menús (`menu`) y combos (`listbox`) no cuentan.
 */
export const SELECTOR_CAPTURA_ABIERTA = '[role="dialog"], [role="alertdialog"]';

export function hayCapturaAbierta(
  doc: { querySelector(selectores: string): unknown } | null | undefined,
): boolean {
  return Boolean(doc?.querySelector(SELECTOR_CAPTURA_ABIERTA));
}
