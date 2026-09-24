import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  armarContentDisposition,
  escaparHtml,
  nombreDeContentDisposition,
  pideHtml,
} from "@/lib/pdf-http";

/**
 * FUENTE ÚNICA de los proxies de ARCHIVOS del panel (`app/api/**`): pide el
 * binario al API con el JWT de la sesión (cookie, nunca token en el cliente)
 * y lo sirve con su `Content-Type`, `Content-Disposition` (inline para ver /
 * attachment para descargar) y `Content-Length`.
 *
 * Nació para los PDF (11-sep-2026): con `blob:` + `window.open` el visor de
 * Chrome mostraba el PDF pero su botón «Descargar» volvía a pedir el blob y
 * fallaba («Check internet connection»). Con una URL real del proxy el visor
 * descarga bien; `?descargar=1` da además el botón «Descargar» del panel.
 * Desde el 24-sep-2026 el MISMO núcleo sirve los Excel de caja chica
 * (`proxyArchivoDelApi` con `TIPO_XLSX`): dos proxies copiados divergirían en
 * cómo tratan la sesión y los errores.
 *
 * `Cache-Control: no-store`: el archivo se regenera en cada petición a
 * propósito — una versión nueva de la cotización, un toggle del PDF (que NO
 * crea versión) o un gasto nuevo de la caja deben reflejarse siempre. La
 * fiabilidad del documento manda sobre el ahorro de un render.
 */

/** Qué clase de archivo sirve el proxy. */
export interface TipoArchivoProxy {
  contentType: string;
  /** Con punto: `.pdf`, `.xlsx`. */
  extension: string;
  /** `Accept` hacia el API. */
  accept: string;
  /** Título de la página de error de una navegación. */
  tituloError: string;
}

export const TIPO_PDF: TipoArchivoProxy = {
  contentType: "application/pdf",
  extension: ".pdf",
  accept: "application/pdf, application/json",
  tituloError: "No se pudo abrir el PDF",
};

export const TIPO_XLSX: TipoArchivoProxy = {
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  extension: ".xlsx",
  accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json",
  tituloError: "No se pudo descargar el Excel",
};

export interface PdfProxyOpts {
  /** Ruta en el API, ya con el id: `/v1/quotes/<uuid>/pdf`. */
  path: string;
  /** Verbo hacia el API (el navegador siempre entra por GET). */
  method?: "GET" | "POST";
  /** Nombre de archivo si el API no manda `Content-Disposition`. */
  filename: string;
  /** true = `attachment` (botón «Descargar» del panel). */
  descargar?: boolean;
  /** Mensaje genérico cuando el API falla sin decir por qué. */
  errorMsg: string;
  /** Mensajes es-MX por status (p. ej. 403 sin rol). */
  mensajes?: Partial<Record<number, { message: string; code: string }>>;
  /** Petición del navegador (Accept: text/html) → página de error legible. */
  html?: boolean;
}

export interface ArchivoProxyOpts extends PdfProxyOpts {
  tipo: TipoArchivoProxy;
}

/** ¿La petición es una navegación (pestaña) y no un `fetch` de la UI? */
export function esNavegacion(req: Request): boolean {
  return pideHtml(req.headers.get("accept"));
}

/** ¿El caller pidió la descarga directa (`?descargar=1`)? */
export function pidioDescarga(req: Request): boolean {
  const v = new URL(req.url).searchParams.get("descargar");
  return v === "1" || v === "true";
}

/**
 * Valida el id de la ruta (los proxies solo aceptan uuid del API).
 * Fuente única desde el 21-sep-2026: `lib/admin/url-params.ts` — la misma
 * función que usan las páginas de detalle para responder `notFound()` sin
 * llamar al API. Se re-exporta aquí para no romper a quien ya la importa.
 */
export { esUuid } from "@/lib/admin/url-params";

/**
 * Error del proxy: JSON `{ message, code }` para la UI y una página HTML
 * mínima en es-MX cuando la petición es una navegación (si no, el operador
 * vería el JSON crudo en la pestaña).
 */
export function errorArchivo(
  message: string,
  code: string,
  status: number,
  html = false,
  titulo = TIPO_PDF.tituloError,
): Response {
  if (!html) return NextResponse.json({ message, code }, { status });
  const cuerpo = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#102a43}
.caja{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.125rem;margin:0 0 .5rem}
p{margin:0;color:#486581;font-size:.95rem}code{font-size:.75rem;color:#829ab1}</style></head>
<body><div class="caja"><h1>${escaparHtml(titulo)}</h1><p>${escaparHtml(message)}</p>
<p style="margin-top:1rem"><code>${escaparHtml(code)}</code></p></div></body></html>`;
  return new Response(cuerpo, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Error de un proxy de PDF (título «No se pudo abrir el PDF»). */
export function errorPdf(
  message: string,
  code: string,
  status: number,
  html = false,
): Response {
  return errorArchivo(message, code, status, html, TIPO_PDF.tituloError);
}

/**
 * 404 de Nest por RUTA inexistente («Cannot GET /v1/…»): el API todavía no
 * tiene ese endpoint (panel desplegado antes que el API). Se dice en es-MX en
 * vez de pintar el texto técnico en inglés.
 */
export const MENSAJE_RUTA_NO_DISPONIBLE =
  "Esta descarga todavía no está disponible en el servidor (falta actualizarlo). Intenta más tarde; si sigue igual, avisa a sistemas.";

export async function proxyArchivoDelApi(opts: ArchivoProxyOpts): Promise<Response> {
  const html = opts.html === true;
  const titulo = opts.tipo.tituloError;
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return errorArchivo(
      "Tu sesión expiró: vuelve a iniciar sesión.",
      "UNAUTHORIZED",
      401,
      html,
      titulo,
    );
  }

  const base = env.API_URL.replace(/\/$/, "");
  let upstream: Response;
  try {
    upstream = await fetch(`${base}${opts.path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: opts.tipo.accept,
      },
      cache: "no-store",
    });
  } catch {
    return errorArchivo(
      "No hay conexión con el API. Intenta de nuevo.",
      "UPSTREAM_DOWN",
      502,
      html,
      titulo,
    );
  }

  if (!upstream.ok) {
    const porStatus = opts.mensajes?.[upstream.status];
    let message = porStatus?.message ?? opts.errorMsg;
    let code = porStatus?.code ?? (opts.tipo === TIPO_PDF ? "PDF_ERROR" : "ARCHIVO_ERROR");
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // El API respondió sin JSON (p. ej. 502 de pyservices): mensaje genérico.
    }
    if (upstream.status === 404 && /^Cannot (GET|POST)\b/.test(message)) {
      message = MENSAJE_RUTA_NO_DISPONIBLE;
      code = "RUTA_NO_DISPONIBLE";
    }
    return errorArchivo(message, code, upstream.status, html, titulo);
  }

  // Se bufferea a propósito: así el proxy manda `Content-Length` exacto — sin
  // él, algunos visores no ofrecen «Descargar» y las barras de progreso del
  // navegador quedan a ciegas.
  const bytes = await upstream.arrayBuffer();
  const nombre =
    nombreDeContentDisposition(upstream.headers.get("content-disposition")) ??
    opts.filename;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": opts.tipo.contentType,
      "Content-Disposition": armarContentDisposition(nombre, {
        descargar: opts.descargar,
        respaldo: opts.filename,
        extension: opts.tipo.extension,
      }),
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

/** Proxy de PDF (el de siempre): por defecto POST hacia el API. */
export async function proxyPdfDelApi(opts: PdfProxyOpts): Promise<Response> {
  return proxyArchivoDelApi({ ...opts, method: opts.method ?? "POST", tipo: TIPO_PDF });
}
