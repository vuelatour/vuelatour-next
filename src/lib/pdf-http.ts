/**
 * Helpers PUROS de cabeceras HTTP para los PDF que sirve el panel (proxies
 * `app/api/**`). Sin imports de Next ni de Supabase: se prueban con vitest.
 *
 * Regla (11-sep-2026, bug «Check internet connection» de Chrome): un PDF que
 * se ABRE en el visor NUNCA se sirve como `blob:` (`URL.createObjectURL` +
 * `window.open`) — el botón «Descargar» del visor vuelve a pedir la URL y el
 * blob ya no existe. Se sirve por una URL real del proxy con
 * `Content-Type: application/pdf`, `Content-Disposition` (inline | attachment)
 * y `Content-Length`.
 */

/** Nombre de archivo dentro de un `Content-Disposition` (soporta `filename*`). */
export function nombreDeContentDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  // RFC 5987: filename*=UTF-8''nombre%20con%20acentos.pdf (gana al simple).
  const ext = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)?.[1];
  if (ext) {
    try {
      const v = decodeURIComponent(ext.trim());
      if (v) return v;
    } catch {
      // porcentaje inválido: cae al `filename` simple
    }
  }
  const simple = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header);
  const v = (simple?.[1] ?? simple?.[2] ?? "").trim();
  return v ? v : null;
}

/** Sin rutas, comillas ni saltos de línea (cabecera segura) y con `.pdf`. */
export function nombreArchivoSeguro(nombre: string, respaldo = "documento.pdf"): string {
  const base = (nombre ?? "")
    .replace(/[\r\n]/g, " ")
    .split(/[\\/]/)
    .pop()!
    .replace(/["]/g, "")
    .trim();
  const limpio = base || respaldo;
  return /\.pdf$/i.test(limpio) ? limpio : `${limpio}.pdf`;
}

/**
 * `inline; filename="cotizacion-123.pdf"` (ver en el visor) o `attachment; …`
 * (botón «Descargar»). Se manda también `filename*` para conservar acentos:
 * el `filename` simple va en ASCII para navegadores viejos.
 */
export function armarContentDisposition(
  nombre: string,
  opts: { descargar?: boolean; respaldo?: string } = {},
): string {
  const seguro = nombreArchivoSeguro(nombre, opts.respaldo);
  const ascii = seguro.replace(/[^\x20-\x7E]/g, "-").replace(/["]/g, "");
  const tipo = opts.descargar ? "attachment" : "inline";
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(seguro)}`;
}

/** ¿La petición es una NAVEGACIÓN del navegador (pestaña) y no un `fetch`? */
export function pideHtml(accept: string | null | undefined): boolean {
  return (accept ?? "").toLowerCase().includes("text/html");
}

/** Escapa texto para incrustarlo en la página de error del proxy. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
