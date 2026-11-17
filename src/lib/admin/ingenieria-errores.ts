/**
 * Errores del API en lo nuevo de ingeniería (evidencias y componentes con vida
 * límite, 17-nov-2026, API 0.0.140). PURO: lo comparten
 * `adjuntos-ingenieria.ts` y `componentes-aeronave.ts`.
 *
 * Dos desenlaces que NO se confunden:
 *  - «no disponible»: el API todavía no trae la ruta (404 = API previo) o la
 *    migración no está aplicada (`disponible: false` / 503
 *    `MIGRACION_PENDIENTE`). Lo nuevo se ESCONDE y se dice en gris.
 *  - «falló»: cualquier otra cosa. Se dice y se ofrece «Reintentar»; jamás se
 *    pinta «sin archivos» / «sin componentes» cuando no se pudo leer.
 */

/** Lo que interesa de un error del API (`ApiError`) o de cualquier `Error`. */
export interface ErrorIngenieria {
  status?: number;
  code?: string;
  message?: string;
}

/** Normaliza lo que haya lanzado la llamada (ApiError, Error o cualquier cosa). */
export function errorIngenieriaDe(e: unknown): ErrorIngenieria {
  if (e && typeof e === "object") {
    const o = e as { status?: unknown; code?: unknown; message?: unknown };
    return {
      status: typeof o.status === "number" ? o.status : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
      message: typeof o.message === "string" ? o.message : undefined,
    };
  }
  return { message: typeof e === "string" ? e : undefined };
}

export const CODIGO_MIGRACION_PENDIENTE = "MIGRACION_PENDIENTE";

/**
 * ¿La CARGA de una lista dice que el API todavía no ofrece lo nuevo? (404 de
 * la ruta = API previo, o migración sin aplicar). Solo para las listas del
 * avión: ahí el avión existe (la página ya lo leyó), así que un 404 solo puede
 * ser la ruta.
 */
export function esNoDisponible(e: ErrorIngenieria): boolean {
  return e.status === 404 || e.code === CODIGO_MIGRACION_PENDIENTE;
}

/**
 * ¿El 404 es de la RUTA (API sin desplegar) y no de un registro que ya no
 * existe? Nest responde «Cannot POST /v1/…» cuando la ruta no existe; un
 * registro borrado trae el mensaje del API en español.
 */
export function esRutaInexistente(e: ErrorIngenieria): boolean {
  return (
    e.status === 404 &&
    /^Cannot (GET|POST|PATCH|PUT|DELETE) /i.test(e.message?.trim() ?? "")
  );
}

/** Cómo quedó una carga: el estado decide qué se pinta. */
export type EstadoCarga = "cargando" | "listo" | "no_disponible" | "error";

/** Estado de una carga que FALLÓ. */
export function estadoDeError(e: unknown): Exclude<EstadoCarga, "cargando" | "listo"> {
  return esNoDisponible(errorIngenieriaDe(e)) ? "no_disponible" : "error";
}

/** Estado de una carga que respondió (el API dice si la migración ya está). */
export function estadoDeRespuesta(r: { disponible?: boolean } | null | undefined): EstadoCarga {
  return r && r.disponible === false ? "no_disponible" : "listo";
}

/** Lo que se dice, en gris, cuando el API todavía no ofrece lo nuevo. */
export const TEXTO_NO_DISPONIBLE = "Disponible cuando se actualice el sistema.";

/** Mensaje para un toast cuando una ESCRITURA choca con «no disponible». */
export const TEXTO_ESCRITURA_NO_DISPONIBLE =
  "Todavía no está disponible: falta actualizar el sistema. Avisa a sistemas.";

export const TEXTO_SIN_PERMISO = "Tu usuario no tiene permiso para hacer esto.";

export const TEXTO_ERROR_GENERICO = "No se pudo completar. Reintenta en un momento.";

export const TEXTO_YA_NO_EXISTE = "Ese registro ya no existe. Recarga la página.";

/**
 * Mensaje base de un error de ESCRITURA (o de abrir un archivo): migración
 * pendiente o ruta sin desplegar → sin permiso → registro que ya no existe →
 * el texto del API (ya viene en es-MX) → genérico. Los módulos anteponen sus
 * códigos propios.
 */
export function mensajeErrorBase(e: ErrorIngenieria): string {
  if (e.code === CODIGO_MIGRACION_PENDIENTE || esRutaInexistente(e)) {
    return TEXTO_ESCRITURA_NO_DISPONIBLE;
  }
  if (e.status === 403) return TEXTO_SIN_PERMISO;
  const texto = e.message?.trim();
  if (e.status === 404) return texto ? texto : TEXTO_YA_NO_EXISTE;
  return texto ? texto : TEXTO_ERROR_GENERICO;
}
