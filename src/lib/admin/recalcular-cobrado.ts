/**
 * RECALCULAR LA BANDERA «COBRADO» DE LOS VUELOS (22-oct-2026, API 0.0.102,
 * invariante 99 del API «pesos primero»).
 *
 * `POST /v1/flights/recalcular-cobrado` (solo ADMIN) recorre los vuelos con
 * precio (hasta 5,000) y vuelve a decidir si están cobrados con la K de la
 * cotización: un cobro en pesos cuenta al precio en pesos, no al T.C. del día
 * del cobro. No toca dinero ni cobros: solo la bandera `vuelo.cobrado`, y
 * solo escribe la que cambia. Se corre UNA vez tras subir el 0.0.102 y es
 * seguro repetirlo.
 *
 * FUENTE ÚNICA PURA de los textos, la lectura defensiva de la respuesta y el
 * resumen; la red vive en `recalcularCobradoAction` (Configuración).
 */

export interface VueloRecalculado {
  id: string;
  folio: number | null;
  antes: boolean;
  despues: boolean;
}

export interface ErrorRecalculo {
  id: string;
  folio: number | null;
  error: string;
}

export interface ResultadoRecalcularCobrado {
  revisados: number;
  cambiados: VueloRecalculado[];
  errores: ErrorRecalculo[];
}

export const TITULO_RECALCULAR_COBRADO = "Bandera «cobrado» de los vuelos";

export const DESCRIPCION_RECALCULAR_COBRADO =
  "Desde el API 0.0.102 un cobro en pesos cuenta al tipo de cambio de la cotización (pesos primero). Este botón recorre todos los vuelos con precio y corrige la bandera «cobrado» de los que cambien. No mueve dinero ni cobros: solo la marca. Córrelo una vez después de actualizar; es seguro repetirlo.";

export const ETIQUETA_BOTON_RECALCULAR = "Recalcular ahora";
export const ETIQUETA_BOTON_RECALCULANDO = "Recalculando…";

export const TITULO_CONFIRMAR_RECALCULO = "¿Recalcular la bandera «cobrado» de todos los vuelos?";

export const TEXTO_CONFIRMAR_RECALCULO =
  "Se revisan todos los vuelos con precio (hasta 5,000) y solo se escribe la bandera de los que cambien. Puede tardar un par de minutos; no cierres la página.";

export const TEXTO_RECALCULO_API_PREVIO =
  "Falta actualizar el servidor: el recálculo existe desde el API 0.0.102.";
export const TEXTO_RECALCULO_SIN_PERMISO = "Solo un administrador puede recalcular la bandera.";
export const TEXTO_RECALCULO_SESION = "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
export const TEXTO_RECALCULO_SIN_RESPUESTA =
  "No hubo respuesta del servidor. El recálculo puede haber corrido de todos modos: repítelo (es seguro) o revisa los vuelos.";
export const TEXTO_RECALCULO_RESPUESTA_RARA =
  "El servidor respondió algo inesperado; no se puede mostrar el resultado. Revisa los vuelos o repite el recálculo.";

/** Lectura defensiva de la respuesta del API (basura ⇒ null, nunca un 0 inventado). */
export function normalizarResultadoRecalculo(raw: unknown): ResultadoRecalcularCobrado | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.revisados !== "number" || !Array.isArray(r.cambiados) || !Array.isArray(r.errores)) return null;
  const cambiados = r.cambiados
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string")
    .map((c) => ({
      id: c.id as string,
      folio: typeof c.folio === "number" ? c.folio : null,
      antes: c.antes === true,
      despues: c.despues === true,
    }));
  const errores = r.errores
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      id: typeof e.id === "string" ? e.id : "",
      folio: typeof e.folio === "number" ? e.folio : null,
      error: typeof e.error === "string" ? e.error : "error desconocido",
    }));
  return { revisados: r.revisados, cambiados, errores };
}

/** «#123» o «vuelo» (sin folio). */
export function folioTexto(v: { folio: number | null }): string {
  return v.folio != null && v.folio > 0 ? `#${v.folio}` : "vuelo";
}

/** «#123: pendiente → cobrado». */
export function textoCambio(v: VueloRecalculado): string {
  const estado = (b: boolean) => (b ? "cobrado" : "pendiente");
  return `${folioTexto(v)}: ${estado(v.antes)} → ${estado(v.despues)}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * «Se revisaron 412 vuelos; cambiaron 3 (2 pasaron a cobrado, 1 a pendiente);
 * 1 vuelo con error.» / «Se revisaron 412 vuelos y ninguna bandera cambió.»
 */
export function resumenRecalculo(r: ResultadoRecalcularCobrado): string {
  const vuelos = `${r.revisados.toLocaleString("es-MX")} ${plural(r.revisados, "vuelo", "vuelos")}`;
  const aCobrado = r.cambiados.filter((c) => c.despues).length;
  const aPendiente = r.cambiados.length - aCobrado;
  const partes: string[] = [];
  if (r.cambiados.length === 0) {
    partes.push(`Se revisaron ${vuelos} y ninguna bandera cambió.`);
  } else {
    const detalle = [
      aCobrado > 0 ? `${aCobrado} ${plural(aCobrado, "pasó", "pasaron")} a cobrado` : null,
      aPendiente > 0 ? `${aPendiente} ${plural(aPendiente, "pasó", "pasaron")} a pendiente` : null,
    ]
      .filter(Boolean)
      .join(", ");
    partes.push(
      `Se revisaron ${vuelos}; ${plural(r.cambiados.length, "cambió", "cambiaron")} ${r.cambiados.length} (${detalle}).`,
    );
  }
  if (r.errores.length > 0) {
    partes.push(`${r.errores.length} ${plural(r.errores.length, "vuelo con error", "vuelos con error")}.`);
  }
  return partes.join(" ");
}

/** Texto del toast tras el recálculo (el mismo resumen, con el prefijo). */
export function toastRecalculo(r: ResultadoRecalcularCobrado): string {
  return `Bandera «cobrado» recalculada. ${resumenRecalculo(r)}`;
}

/** Lo que devuelve la action (forma de `ActionResult`). */
export interface RespuestaRecalculo {
  ok: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
}

/**
 * Texto es-MX de un rechazo: el `message` del API va tal cual salvo lo
 * técnico (404 de un API previo, 401/403, red caída).
 */
export function mensajeErrorRecalculo(r: RespuestaRecalculo): string {
  if (r.status === 401) return TEXTO_RECALCULO_SESION;
  if (r.status === 403) return TEXTO_RECALCULO_SIN_PERMISO;
  if (r.status === 404) return TEXTO_RECALCULO_API_PREVIO;
  if (r.code === "SIN_CONEXION" || !r.error || /fetch failed|ECONNREFUSED|Internal server error|<html/i.test(r.error)) {
    return TEXTO_RECALCULO_SIN_RESPUESTA;
  }
  return r.error.trim();
}

/** Cuántos cambios se listan completos en la tarjeta; el resto se resume. */
export const MAX_CAMBIOS_LISTADOS = 50;
