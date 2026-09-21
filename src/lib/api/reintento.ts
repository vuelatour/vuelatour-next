/**
 * Reintento del punto ÚNICO de red del panel (`apiFetch`) — 21-sep-2026.
 *
 * El síntoma: Railway responde «Application failed to respond» (502/503)
 * durante ~30–60 s en CADA deploy del API. Como `apiFetch` lanzaba ante todo
 * no-2xx, CUALQUIER pantalla de `/admin` caía al error boundary («Algo se
 * rompió … digest») y el operador solo podía recargar a mano. Con el API sano
 * el recorrido completo (315 rutas) responde 200: el problema es la VENTANA
 * del deploy, no la carga.
 *
 * REGLA (deliberadamente estrecha):
 * - Solo **GET** (y `HEAD`): repetir una mutación puede duplicar dinero
 *   (un cobro, un gasto, una versión de cotización). Las server actions del
 *   panel son POST/PATCH/PUT/DELETE y JAMÁS se reintentan aquí; su
 *   idempotencia vive en el API (`client_request_id`).
 * - Solo ante **error de red**, **502**, **503** o **504**: son «el servidor
 *   no está ahí todavía». Un 4xx es una respuesta legítima (no cambia al
 *   repetirla) y un **500** es un bug del API: repetirlo lo esconde y
 *   multiplica la carga.
 * - Hasta **2** reintentos con esperas fijas de 400 ms y 1200 ms (1.6 s en el
 *   peor caso, bajo el presupuesto de una función de Vercel).
 *
 * Helpers PUROS para poder probarlos sin red: `fetcher.ts` los usa y
 * `__tests__/fetcher-reintento.test.ts` los congela.
 */

/** Esperas entre intentos, en ms. Su longitud ES el tope de reintentos. */
export const ESPERAS_REINTENTO_MS: readonly number[] = [400, 1200];

/** Máximo de reintentos (además del intento original). */
export const MAX_REINTENTOS = ESPERAS_REINTENTO_MS.length;

/** Códigos que significan «el API no está respondiendo todavía». */
export const ESTADOS_REINTENTABLES: readonly number[] = [502, 503, 504];

/** Métodos seguros de repetir (no mutan nada). */
const METODOS_REINTENTABLES = new Set(["GET", "HEAD"]);

/** ¿Es un método que se puede repetir sin riesgo de duplicar algo? */
export function esMetodoReintentable(method?: string | null): boolean {
  // Sin método explícito, `fetch` hace GET.
  return METODOS_REINTENTABLES.has((method ?? "GET").toUpperCase());
}

/** ¿El código HTTP amerita reintento? (nunca 4xx ni 500). */
export function esEstadoReintentable(status: number): boolean {
  return ESTADOS_REINTENTABLES.includes(status);
}

/**
 * ¿La excepción de `fetch` es un fallo de RED (el API no levantó la conexión)?
 * Node/undici lanza `TypeError: fetch failed` con la causa real en `cause`
 * (ECONNREFUSED, ECONNRESET, ENOTFOUND, EAI_AGAIN, socket hang up…).
 *
 * `AbortError` NO entra: abortar es deliberado (el cotizador cancela su
 * `/calculate` en cada tecla) y reintentarlo sería pelearse con el usuario.
 */
export function esErrorDeRed(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string; code?: string; cause?: unknown };
  if (err.name === "AbortError" || err.name === "TimeoutError") return false;
  const textos = [err.message, err.code];
  const causa = err.cause as { message?: string; code?: string } | undefined;
  if (causa && typeof causa === "object") textos.push(causa.message, causa.code);
  const texto = textos.filter(Boolean).join(" ");
  if (/^(ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|UND_ERR)/i.test(texto))
    return true;
  return /fetch failed|network|socket hang up|other side closed|terminated|connect(ion)? (refused|reset)/i.test(
    texto,
  );
}

/**
 * Espera antes del intento `intento + 1` (0-based), o `null` si ya se agotaron
 * los reintentos.
 */
export function esperaReintento(intento: number): number | null {
  return ESPERAS_REINTENTO_MS[intento] ?? null;
}

/** `setTimeout` como promesa (aislado para poder falsear el reloj en pruebas). */
export function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cabecera que marca el número de reintento… y que EXISTE por una razón que
 * no es cosmética (hallazgo del 21-sep-2026, con el arnés de reproducción):
 *
 * Next **deduplica** los `fetch` de un mismo render (`dedupe-fetch.js`, la
 * memoización de React). La clave incluye método y CABECERAS, pero NO la URL
 * repetida ni el número de intento, así que un segundo `fetch(url, init)`
 * IDÉNTICO dentro del mismo Server Component **no vuelve a salir a la red**:
 * devuelve un clon de la MISMA respuesta 503. Medido: con el API caído, la
 * pantalla tardaba los 1.6 s de las dos esperas y caía igual al error
 * boundary, y el proxy solo veía UNA petición. Es decir: el reintento era un
 * placebo justo en el caso para el que se escribió (el render del servidor
 * durante la ventana de deploy de Railway).
 *
 * Con una cabecera distinta por intento, la clave de deduplicación cambia y
 * cada reintento SÍ sale a la red. Solo se agrega en el SERVIDOR: en el
 * navegador no hay memoización que romper y una cabecera no-safelisted
 * dispararía un preflight CORS en el peor momento.
 */
export const CABECERA_REINTENTO = "x-vt-reintento";

/** ¿Corre en el servidor? (ahí es donde Next memoiza los `fetch`). */
function enServidor(): boolean {
  return typeof window === "undefined";
}

/**
 * Cabeceras del intento `intento` (0 = original). A partir del primer
 * reintento agrega `x-vt-reintento` para que Next no sirva la respuesta
 * memoizada del intento anterior.
 */
export function cabecerasDeIntento(
  base: Record<string, string>,
  intento: number,
): Record<string, string> {
  if (intento <= 0 || !enServidor()) return base;
  return { ...base, [CABECERA_REINTENTO]: String(intento) };
}
