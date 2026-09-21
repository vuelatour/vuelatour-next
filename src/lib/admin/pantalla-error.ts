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
