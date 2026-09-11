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
 * FUENTE ÚNICA de los proxies de PDF del panel (`app/api/**`): pide el
 * binario al API con el JWT de la sesión (cookie, nunca token en el cliente)
 * y lo sirve con `Content-Type: application/pdf`, `Content-Disposition`
 * (inline para ver / attachment para descargar) y `Content-Length`.
 *
 * Por qué (11-sep-2026): con `blob:` + `window.open` el visor de Chrome
 * mostraba el PDF pero su botón «Descargar» volvía a pedir el blob y fallaba
 * («Check internet connection»). Con una URL real del proxy el visor descarga
 * bien; `?descargar=1` da además el botón «Descargar» del panel.
 *
 * `Cache-Control: no-store`: el PDF se regenera en cada petición a propósito
 * — una versión nueva de la cotización o un toggle del PDF (que NO crea
 * versión) debe reflejarse siempre. La fiabilidad del documento manda sobre
 * el ahorro de un render.
 */

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

/** ¿La petición es una navegación (pestaña) y no un `fetch` de la UI? */
export function esNavegacion(req: Request): boolean {
  return pideHtml(req.headers.get("accept"));
}

/** ¿El caller pidió la descarga directa (`?descargar=1`)? */
export function pidioDescarga(req: Request): boolean {
  const v = new URL(req.url).searchParams.get("descargar");
  return v === "1" || v === "true";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el id de la ruta (los proxies solo aceptan uuid del API). */
export function esUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Error del proxy: JSON `{ message, code }` para la UI y una página HTML
 * mínima en es-MX cuando la petición es una navegación (si no, el operador
 * vería el JSON crudo en la pestaña).
 */
export function errorPdf(
  message: string,
  code: string,
  status: number,
  html = false,
): Response {
  if (!html) return NextResponse.json({ message, code }, { status });
  const cuerpo = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No se pudo abrir el PDF</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#102a43}
.caja{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.125rem;margin:0 0 .5rem}
p{margin:0;color:#486581;font-size:.95rem}code{font-size:.75rem;color:#829ab1}</style></head>
<body><div class="caja"><h1>No se pudo abrir el PDF</h1><p>${escaparHtml(message)}</p>
<p style="margin-top:1rem"><code>${escaparHtml(code)}</code></p></div></body></html>`;
  return new Response(cuerpo, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function proxyPdfDelApi(opts: PdfProxyOpts): Promise<Response> {
  const html = opts.html === true;
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return errorPdf(
      "Tu sesión expiró: vuelve a iniciar sesión.",
      "UNAUTHORIZED",
      401,
      html,
    );
  }

  const base = env.API_URL.replace(/\/$/, "");
  let upstream: Response;
  try {
    upstream = await fetch(`${base}${opts.path}`, {
      method: opts.method ?? "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/pdf, application/json",
      },
      cache: "no-store",
    });
  } catch {
    return errorPdf(
      "No hay conexión con el API. Intenta de nuevo.",
      "UPSTREAM_DOWN",
      502,
      html,
    );
  }

  if (!upstream.ok) {
    const porStatus = opts.mensajes?.[upstream.status];
    let message = porStatus?.message ?? opts.errorMsg;
    let code = porStatus?.code ?? "PDF_ERROR";
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // El API respondió sin JSON (p. ej. 502 de pyservices): mensaje genérico.
    }
    return errorPdf(message, code, upstream.status, html);
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
      "Content-Type": "application/pdf",
      "Content-Disposition": armarContentDisposition(nombre, {
        descargar: opts.descargar,
        respaldo: opts.filename,
      }),
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
