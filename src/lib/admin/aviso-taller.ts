/**
 * AERONAVE EN TALLER = ADVERTENCIA, NUNCA CANDADO (pedido del cliente,
 * 11-sep-2026): «al cotizar debe poder elegirse un avión aunque esté en
 * taller (son cotizaciones a futuro)… la advertencia está bien pero con eso
 * es suficiente, no debe limitarte; lo mismo para el vuelo».
 *
 * Contrato único entre repos (API ⇄ panel ⇄ app):
 * - El API ya NO responde 409 `AERONAVE_EN_TALLER` en ningún camino: agrega
 *   el aviso a `avisos: string[]` de la respuesta (create/revise/quickAdjust
 *   de cotización, assign, assign por tramo, reassign-aircraft, combinar,
 *   reserva, y por avión dentro del grupo). El panel los pinta en ÁMBAR con
 *   `toastAvisos` / listas ámbar — nunca bloquean ni piden confirmación.
 * - `GET /aircraft` sigue exponiendo `en_taller`: es la MARCA del selector
 *   (`MARCA_EN_TALLER`), que NO deshabilita la opción.
 *
 * FUENTE ÚNICA del texto en este repo (espejo de
 * `src/common/aviso-taller.util.ts` del API y del helper de la app). Si el
 * texto cambia, cambia en los tres.
 *
 * El squawk ALTA NO cambia (409 estructurado + `aceptar_discrepancia_alta` +
 * aviso al mecánico) y los documentos vencidos tampoco (ya solo avisan).
 */

/** Marca del selector: la opción sigue elegible, solo va señalada. */
export const MARCA_EN_TALLER = "En taller";

/** Estado del avión, idéntico en el aviso guardado y en la nota previa. */
const estado = (matricula: string) =>
  `${matricula} está en taller (mantenimiento en curso).`;

/** Cola común: qué hacer con la advertencia (jamás «no se puede»). */
const CONFIRMA_CON_MECANICO =
  "confirma con el mecánico que estará listo para el vuelo.";

/**
 * Texto EXACTO del contrato: el aviso que el API devuelve en `avisos[]`
 * DESPUÉS de guardar. El panel normalmente pinta el string que manda el API;
 * esta función existe para la paridad de texto (compatibilidad con un API
 * viejo que solo mandaba el 409, y pruebas).
 */
export function avisoAeronaveEnTaller(matricula: string): string {
  return `${estado(matricula)} Se guardó de todas formas: ${CONFIRMA_CON_MECANICO}`;
}

/**
 * MISMA advertencia, en el momento en que se ELIGE el avión (todavía no se
 * guarda nada): solo cambia el verbo del medio, porque decir «se guardó» en
 * un formulario abierto sería falso. Informativa, ámbar, sin modal ni
 * confirmación.
 */
export function notaAeronaveEnTaller(matricula: string): string {
  return `${estado(matricula)} Puedes usarlo de todas formas: ${CONFIRMA_CON_MECANICO}`;
}

/** Chip corto para barras de estado (el texto largo va en la nota ámbar). */
export function chipAeronaveEnTaller(matricula: string): string {
  return `${matricula} está en taller`;
}

/**
 * Texto secundario de una opción de avión con la marca de taller al frente.
 * `partes` son las que ya usaba el selector (asientos, kts, «sin tarifa»…).
 */
export function descripcionAeronave(
  partes: (string | null | undefined | false)[],
  enTaller?: boolean | null,
): string | undefined {
  const lista = [
    enTaller ? MARCA_EN_TALLER : null,
    ...partes,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return lista.length > 0 ? lista.join(" · ") : undefined;
}
