/**
 * Errores TÉCNICOS que jamás se le pintan al operador (2-oct-2026).
 *
 * Nació en `conciliacion-reverso.ts` (revisión adversaria 30-sep-2026: salía
 * «Bad Gateway» o «fetch failed» en el toast) y se movió aquí para que la
 * conciliación de un cargo con varios gastos (`conciliacion-lote.ts`) use la
 * MISMA regla: un texto en inglés o de red no es un mensaje, es la señal de
 * que el servidor no contestó (Railway reiniciando ⇒ HTML ⇒ `PARSE_ERROR`,
 * la red cortada, Vercel sin respuesta de la server action).
 *
 * PURO (sin React ni red). Fuente única: quien necesite decidir «¿esto se
 * puede pintar tal cual?» importa de aquí, no copia el regex.
 */

/** Textos técnicos (en inglés o de red) del API, de `fetch` o de Next. */
export const RE_TEXTO_TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Conflict|Service Unavailable|Bad Gateway|Gateway Timeout|fetch failed|Error desconocido)$|fetch failed|failed to fetch|unexpected response|ECONN|socket hang up|network/i;

/** Lo que ve el operador cuando el servidor no contestó con un mensaje útil. */
export const MSG_SERVIDOR_NO_RESPONDIO =
  "El servidor no respondió. Vuelve a intentarlo en un minuto; si sigue igual, avisa a sistemas.";

/** ¿El texto es técnico (o está vacío)? Vacío cuenta: no hay nada que decir. */
export function esTextoTecnico(mensaje: string | null | undefined): boolean {
  const msg = (mensaje ?? "").trim();
  return msg === "" || RE_TEXTO_TECNICO.test(msg);
}

/**
 * ¿El resultado de una server action es un fallo técnico? `PARSE_ERROR` (el
 * API devolvió HTML: Railway reiniciando), sin mensaje, o un texto técnico.
 */
export function esErrorTecnico(r: { error?: string | null; code?: string | null }): boolean {
  return r.code === "PARSE_ERROR" || esTextoTecnico(r.error);
}
