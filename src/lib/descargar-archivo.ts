import { nombreDeContentDisposition } from "@/lib/pdf-http";

/**
 * Descarga un archivo de un PROXY DEL PANEL (`app/api/**`, misma origen: la
 * cookie de sesión viaja sola y el token NUNCA llega al navegador) y lo
 * guarda con `<a download>` (24-sep-2026, Excel de caja chica).
 *
 * Distinto de `descargarDelApi` (`lib/download.ts`), que habla directo con el
 * API con el JWT del navegador: los Excel nuevos van por el proxy, igual que
 * los PDF. El blob es solo para GUARDAR (`<a download>`), nunca para ver en
 * una pestaña — esa es la regla de los PDF («Check internet connection»).
 *
 * Devuelve `null` si la descarga salió bien o el MENSAJE es-MX para el toast
 * (con la causa del servidor cuando existe). Nunca lanza.
 */
export async function descargarArchivoDelPanel(
  url: string,
  opts: {
    /** Nombre si el servidor no manda `Content-Disposition`. */
    respaldo: string;
    /** Para pruebas: cómo se guarda el blob (por defecto `<a download>`). */
    guardar?: (blob: Blob, nombre: string) => void;
    /** Para pruebas: `fetch` inyectado. */
    fetcher?: typeof fetch;
  },
): Promise<string | null> {
  const f = opts.fetcher ?? fetch;
  let res: Response;
  try {
    res = await f(url, {
      method: "GET",
      headers: { Accept: "application/json, */*" },
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return "Sin conexión con el servidor — revisa tu red e inténtalo de nuevo.";
  }
  if (!res.ok) {
    let cuerpo: unknown = null;
    try {
      cuerpo = await res.json();
    } catch {
      // cuerpo no-JSON (p. ej. el 504 de Vercel): cae al genérico
    }
    return mensajeDescargaFallida(res.status, cuerpo);
  }
  try {
    const blob = await res.blob();
    const nombre =
      nombreDeContentDisposition(res.headers.get("content-disposition")) ?? opts.respaldo;
    (opts.guardar ?? guardarConEnlace)(blob, nombre);
    return null;
  } catch {
    return "No se pudo guardar el archivo en tu equipo. Inténtalo de nuevo.";
  }
}

/** Mensaje es-MX de una descarga fallida (PURO, probado). */
export function mensajeDescargaFallida(status: number, cuerpo: unknown): string {
  if (status === 401) return "Tu sesión expiró — recarga la página e inicia sesión de nuevo.";
  if (status === 403) return "Tu usuario no tiene permiso para esta descarga.";
  const b = (cuerpo ?? {}) as { message?: unknown };
  const msg = Array.isArray(b.message)
    ? b.message.filter((m) => typeof m === "string").join("; ")
    : typeof b.message === "string"
      ? b.message
      : "";
  if (msg.trim()) return msg.trim();
  if (status === 504) {
    return "El servidor tardó demasiado en armar el archivo. Inténtalo de nuevo en un momento.";
  }
  return `El servidor respondió con error ${status}.`;
}

function guardarConEnlace(blob: Blob, nombre: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
