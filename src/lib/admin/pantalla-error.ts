/**
 * Pantalla de error del panel, en es-MX y para un OPERADOR — 21-sep-2026.
 *
 * El síntoma reportado: «Algo se rompió — An error occurred in the Server
 * Components render… digest». Dos problemas de una sola pantalla:
 *  a) el texto es de Next y está en INGLÉS (los operadores no son técnicos);
 *  b) no dice qué hacer, y en la práctica la causa era pasajera (el API en
 *     plena ventana de deploy) — «recarga» resolvía.
 *
 * Aquí viven los TEXTOS y los datos para soporte (código, hora Cancún, ruta).
 * PURO y sin React para poder probarlo; el marcado está en
 * `components/admin/pantalla-error.tsx`.
 */

import { CANCUN_TZ } from "@/lib/datetime";

export const TITULO_ERROR = "No pudimos cargar esta pantalla";

export const MENSAJE_ERROR =
  "Suele ser momentáneo (por ejemplo, mientras el sistema se actualiza). " +
  "Pulsa Reintentar; si sigue igual, manda este código a sistemas.";

export const BOTON_REINTENTAR = "Reintentar";
export const BOTON_INICIO = "Volver al inicio";
export const ETIQUETA_CODIGO = "Código";
export const ETIQUETA_HORA = "Hora (Cancún)";
export const ETIQUETA_RUTA = "Pantalla";

/** Cuando Next no selló `digest` (errores del cliente) no hay código que dar. */
export const SIN_CODIGO = "sin código";

/**
 * Código para soporte. Es el `digest` de Next: lo ÚNICO que correlaciona esta
 * pantalla con el error real en los logs del servidor. El `error.message` NO
 * se pinta: en producción Next lo reemplaza por su texto genérico en inglés
 * («An error occurred in the Server Components render…»), que fue justo lo
 * que vio el operador.
 */
export function codigoDeError(error: { digest?: string } | null | undefined): string {
  const digest = error?.digest?.trim();
  return digest ? digest : SIN_CODIGO;
}

/** Momento del fallo en hora de Cancún: «21/09/2026, 10:14». */
export function horaCancun(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CANCUN_TZ,
  }).format(fecha);
}

/**
 * Ruta que falló, tal como la vería el operador en la barra del navegador
 * (con sus filtros: a menudo el parámetro inválido ES la causa).
 */
export function rutaActual(loc?: { pathname?: string; search?: string } | null): string {
  if (!loc?.pathname) return "—";
  return `${loc.pathname}${loc.search ?? ""}`;
}

/**
 * Una sola línea copiable para pegar en WhatsApp/correo a sistemas.
 * «Código ABC123 · 21/09/2026, 10:14 (Cancún) · /admin/inventory»
 */
export function lineaParaSoporte(datos: {
  codigo: string;
  hora: string;
  ruta: string;
}): string {
  return `${ETIQUETA_CODIGO} ${datos.codigo} · ${datos.hora} (Cancún) · ${datos.ruta}`;
}

/**
 * Error de VERSIÓN (28-oct-2026). Síntoma: «No pudimos cargar esta pantalla ·
 * sin código» en /admin/expenses a las 12:24, con el panel desplegado a las
 * 11:41 (hora Cancún). La pestaña llevaba abierta desde antes del deploy y,
 * al navegar, el navegador pidió archivos («chunks») o módulos de la versión
 * vieja que Vercel ya no sirve (cada deploy publica archivos con otro hash).
 * Next no sella `digest` (el fallo ocurre en el navegador) y «Reintentar»
 * (`unstable_retry`) vuelve a pedir los datos con el MISMO código viejo: la
 * única salida es RECARGAR la página. Se reconoce por el nombre y los
 * mensajes que dan webpack, React y los tres navegadores.
 */
const PATRONES_ERROR_VERSION: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Loading (?:CSS )?chunk \S+ failed/i,
  /Failed to fetch dynamically imported module/i, // Chrome
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  // Runtime de webpack viejo ejecutando un módulo que ya no está en su tabla.
  /Cannot read propert(?:y|ies) of undefined \(reading 'call'\)/i, // Chrome
  /undefined is not an object \(evaluating .*\.call/i, // Safari
  /Could not find the module .* in the React Client Manifest/i,
  /Cannot find module '.*' for page/i,
  // Un formulario de la versión vieja mandó una acción de servidor que la
  // versión nueva ya no conoce.
  /Failed to find Server Action/i,
];

/** true = el error es de versión: recargar la página lo resuelve. */
export function esErrorDeVersion(
  error: { name?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const mensaje = typeof error.message === "string" ? error.message : "";
  return PATRONES_ERROR_VERSION.some((re) => re.test(mensaje));
}

export const MENSAJE_ERROR_VERSION =
  "El panel se actualizó mientras esta pestaña estaba abierta. " +
  "Pulsa Recargar para traer la versión nueva; si sigue igual, manda este código a sistemas.";
export const BOTON_RECARGAR = "Recargar";

/** Marca (sessionStorage) del último auto-recargo por versión: el freno del bucle. */
export const CLAVE_RECARGA_VERSION = "vt:recarga-version";
/** Dentro de esta ventana NO se vuelve a recargar solo: se muestra la pantalla con «Recargar». */
export const VENTANA_RECARGA_MS = 60_000;

type AlmacenMinimo = Pick<Storage, "getItem" | "setItem">;

/**
 * ¿Toca recargar solo? Sí la primera vez (y se marca el momento); NO si ya se
 * recargó por esto en el último minuto: entonces el error no era de versión,
 * o la versión nueva también falla, y el operador debe ver la pantalla con
 * «Recargar» y el código. Sin almacenamiento (modo privado, bloqueado)
 * tampoco: sin marca no hay forma de frenar un bucle.
 */
export function debeRecargarPorVersion(
  almacen: AlmacenMinimo | null | undefined,
  ahora: number = Date.now(),
): boolean {
  if (!almacen) return false;
  try {
    const previo = Number(almacen.getItem(CLAVE_RECARGA_VERSION) ?? "");
    if (Number.isFinite(previo) && previo > 0 && ahora - previo < VENTANA_RECARGA_MS) {
      return false;
    }
    almacen.setItem(CLAVE_RECARGA_VERSION, String(ahora));
    return true;
  } catch {
    return false;
  }
}

/** `sessionStorage` del navegador, o null si no existe o está bloqueado. */
export function almacenDeSesion(): AlmacenMinimo | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}
