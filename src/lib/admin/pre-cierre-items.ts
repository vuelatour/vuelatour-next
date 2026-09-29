/**
 * Checklist de PRE-CIERRE — reglas PURAS comunes a todos los renglones
 * (29-sep-2026). Los renglones de un aviso en particular viven en su propio
 * módulo (`pre-cierre-tacos.ts`, `seguimiento.ts`).
 *
 * `lectura_fallida` (ADITIVO del API, hoy en `seguimiento_cotizacion_pendiente`):
 * el API NO pudo leer ese dato y manda `count: 0`. Ese 0 NO significa «no
 * hay»: esconder el renglón (la card solo pinta `count > 0`) sería afirmar
 * que el periodo está en orden sin haberlo verificado — la regla de siempre
 * del panel es jamás mentir con un vacío.
 */

export interface ItemPreCierreConteo {
  count: number;
  /** true = el API no pudo leer el dato (el `count` no es confiable). */
  lectura_fallida?: boolean | null;
}

/** ¿Se pinta el renglón? Con pendientes o cuando la lectura FALLÓ. */
export function itemPreCierreVisible(item: ItemPreCierreConteo): boolean {
  return item.count > 0 || item.lectura_fallida === true;
}

/** Lo que va tras el título: «3» o, si la lectura falló, «sin verificar». */
export function textoConteoPreCierre(item: ItemPreCierreConteo): string {
  return item.lectura_fallida === true ? "sin verificar" : String(item.count);
}
